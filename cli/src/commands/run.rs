use anyhow::{Context, Result};
use clap::Args;
use std::process::Command;

use crate::adapters::criterion::parse_criterion_output;
use crate::api::{ApiClient, Config, MetricInput};

#[derive(Args)]
pub struct RunArgs {
    #[arg(long, short)]
    pub project: String,

    #[arg(long, short, default_value = "main")]
    pub branch: String,

    #[arg(long, short)]
    pub testbed: Option<String>,

    #[arg(long)]
    pub hash: Option<String>,

    /// GitHub PR number for posting comments (auto-detected from GITHUB_REF)
    #[arg(long)]
    pub pr: Option<i32>,

    #[arg(long)]
    pub dry_run: bool,

    #[arg(trailing_var_arg = true, required = true)]
    pub command: Vec<String>,
}

/// Parse PR number from GITHUB_REF environment variable format
/// e.g., "refs/pull/123/merge" -> Some(123)
pub fn parse_pr_from_github_ref(github_ref: &str) -> Option<i32> {
    if github_ref.starts_with("refs/pull/") {
        github_ref
            .strip_prefix("refs/pull/")
            .and_then(|s| s.split('/').next())
            .and_then(|n| n.parse::<i32>().ok())
            .filter(|&n| n > 0)
    } else {
        None
    }
}

/// Detect PR number from environment variables
pub fn detect_pr_number() -> Option<i32> {
    // Try GITHUB_REF first (e.g., "refs/pull/123/merge")
    std::env::var("GITHUB_REF")
        .ok()
        .and_then(|r| parse_pr_from_github_ref(&r))
        // Also try GITHUB_PR_NUMBER if set directly
        .or_else(|| {
            std::env::var("GITHUB_PR_NUMBER")
                .ok()
                .and_then(|n| n.parse().ok())
        })
}

pub async fn handle(args: RunArgs, api_url: &str) -> Result<()> {
    let config = Config::load()?;
    let client = ApiClient::new(api_url, &config.token);

    let testbed = args
        .testbed
        .unwrap_or_else(|| std::env::consts::OS.to_string());

    let git_hash = args.hash.or_else(|| {
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
    });

    // Auto-detect PR number from GitHub Actions environment
    let pr_number = args.pr.or_else(detect_pr_number);

    println!("Running benchmarks...");
    println!("  Project: {}", args.project);
    println!("  Branch: {}", args.branch);
    println!("  Testbed: {}", testbed);
    if let Some(ref hash) = git_hash {
        println!("  Git hash: {}", hash);
    }
    if let Some(pr) = pr_number {
        println!("  PR: #{}", pr);
    }
    println!();

    let cmd = args.command.join(" ");
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &cmd])
            .output()
            .context("Failed to execute benchmark command")?
    } else {
        Command::new("sh")
            .args(["-c", &cmd])
            .output()
            .context("Failed to execute benchmark command")?
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let combined_output = format!("{}\n{}", stdout, stderr);

    let results = parse_criterion_output(&combined_output);

    if results.is_empty() {
        println!("No benchmark results found in output.");
        println!("Make sure you're running Criterion benchmarks.");
        if !stdout.is_empty() {
            println!("\nStdout:\n{}", stdout);
        }
        if !stderr.is_empty() {
            println!("\nStderr:\n{}", stderr);
        }
        return Ok(());
    }

    println!("Found {} benchmark results:", results.len());
    for result in &results {
        let lower = result
            .lower
            .map(|v| format!("{:.2}", v))
            .unwrap_or_default();
        let upper = result
            .upper
            .map(|v| format!("{:.2}", v))
            .unwrap_or_default();
        println!(
            "  {} : {:.2} ns [{} - {}]",
            result.name, result.value, lower, upper
        );
    }
    println!();

    if args.dry_run {
        println!("Dry run - not submitting results.");
        return Ok(());
    }

    let metrics: Vec<MetricInput> = results
        .into_iter()
        .map(|r| MetricInput {
            benchmark: r.name,
            measure: "latency".to_string(),
            value: r.value,
            lower_value: r.lower,
            upper_value: r.upper,
        })
        .collect();

    println!("Submitting results...");
    let report = client
        .create_report(
            &args.project,
            &args.branch,
            &testbed,
            git_hash.as_deref(),
            pr_number,
            metrics,
        )
        .await?;

    println!("Report submitted: {}", report.id);

    if !report.alerts.is_empty() {
        println!("\n{} alerts generated:", report.alerts.len());
        for alert in &report.alerts {
            let direction = if alert.percent_change > 0.0 { "+" } else { "" };
            println!(
                "  - {}{:.1}% change (baseline: {:.2})",
                direction, alert.percent_change, alert.baseline_value
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pr_from_github_ref_valid() {
        assert_eq!(parse_pr_from_github_ref("refs/pull/123/merge"), Some(123));
        assert_eq!(parse_pr_from_github_ref("refs/pull/1/merge"), Some(1));
        assert_eq!(
            parse_pr_from_github_ref("refs/pull/99999/merge"),
            Some(99999)
        );
        assert_eq!(parse_pr_from_github_ref("refs/pull/42/head"), Some(42));
    }

    #[test]
    fn test_parse_pr_from_github_ref_invalid() {
        assert_eq!(parse_pr_from_github_ref("refs/heads/main"), None);
        assert_eq!(parse_pr_from_github_ref("refs/tags/v1.0.0"), None);
        assert_eq!(parse_pr_from_github_ref(""), None);
        assert_eq!(parse_pr_from_github_ref("refs/pull/"), None);
        assert_eq!(parse_pr_from_github_ref("refs/pull/abc/merge"), None);
    }

    #[test]
    fn test_parse_pr_from_github_ref_edge_cases() {
        // Not starting with refs/pull/
        assert_eq!(parse_pr_from_github_ref("pull/123/merge"), None);
        assert_eq!(parse_pr_from_github_ref(" refs/pull/123/merge"), None);

        // Large PR numbers
        assert_eq!(
            parse_pr_from_github_ref("refs/pull/2147483647/merge"),
            Some(2147483647)
        );

        // Negative numbers (should be rejected)
        assert_eq!(parse_pr_from_github_ref("refs/pull/-1/merge"), None);

        // Zero (should be rejected - PR numbers start at 1)
        assert_eq!(parse_pr_from_github_ref("refs/pull/0/merge"), None);
    }
}
