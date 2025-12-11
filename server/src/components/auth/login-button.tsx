"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginButton() {
  const handleLogin = () => {
    authClient.signIn.social({
      provider: "github",
      callbackURL: "/workspaces",
    });
  };

  return (
    <Button onClick={handleLogin} size="lg">
      Sign in with GitHub
    </Button>
  );
}
