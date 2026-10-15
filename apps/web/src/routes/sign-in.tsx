import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "../ui/auth-page";

export const Route = createFileRoute("/sign-in")({ component: AuthPage });
