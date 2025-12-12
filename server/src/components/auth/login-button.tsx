"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    authClient.signIn.social({
      provider: "github",
      callbackURL: "/workspaces",
    });
  };

  return (
    <Button onClick={handleLogin} size="lg" disabled={isLoading}>
      {isLoading ? (
        <span className="flex items-center">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Signing in...
        </span>
      ) : (
        "Sign in with GitHub"
      )}
    </Button>
  );
}
