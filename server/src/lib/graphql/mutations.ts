import { gql } from "@urql/core";

export const CREATE_PROJECT_MUTATION = gql`
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      id
      slug
      name
      description
      public
    }
  }
`;

export const UPDATE_PROJECT_MUTATION = gql`
  mutation UpdateProject($slug: String!, $input: UpdateProjectInput!) {
    updateProject(slug: $slug, input: $input) {
      id
      slug
      name
      description
      public
    }
  }
`;

export const DELETE_PROJECT_MUTATION = gql`
  mutation DeleteProject($slug: String!) {
    deleteProject(slug: $slug)
  }
`;

export const CREATE_THRESHOLD_MUTATION = gql`
  mutation CreateThreshold($input: CreateThresholdInput!) {
    createThreshold(input: $input) {
      id
      branchId
      testbedId
      measureId
      upperBoundary
      lowerBoundary
      minSampleSize
    }
  }
`;

export const UPDATE_THRESHOLD_MUTATION = gql`
  mutation UpdateThreshold($id: ID!, $input: UpdateThresholdInput!) {
    updateThreshold(id: $id, input: $input) {
      id
      upperBoundary
      lowerBoundary
      minSampleSize
    }
  }
`;

export const DELETE_THRESHOLD_MUTATION = gql`
  mutation DeleteThreshold($id: ID!) {
    deleteThreshold(id: $id)
  }
`;

export const DISMISS_ALERT_MUTATION = gql`
  mutation DismissAlert($id: ID!) {
    dismissAlert(id: $id) {
      id
      status
    }
  }
`;

export const CREATE_API_TOKEN_MUTATION = gql`
  mutation CreateApiToken($name: String!) {
    createApiToken(name: $name) {
      token {
        id
        name
        createdAt
      }
      secret
    }
  }
`;

export const REVOKE_API_TOKEN_MUTATION = gql`
  mutation RevokeApiToken($id: ID!) {
    revokeApiToken(id: $id)
  }
`;

export const UPDATE_GITHUB_SETTINGS_MUTATION = gql`
  mutation UpdateGitHubSettings($slug: String!, $input: UpdateGitHubSettingsInput!) {
    updateGitHubSettings(slug: $slug, input: $input) {
      id
      githubRepo
      githubPrComments
      githubStatusChecks
      hasGithubToken
    }
  }
`;
