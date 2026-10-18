import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";

export const Route = createFileRoute("/sign-up")({ component: () => <AuthPage mode="sign-up" /> });
