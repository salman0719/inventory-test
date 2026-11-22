"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/** Only same-origin paths are accepted as a post-sign-in destination. */
function safeNext(value: string | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error:
          "That address is not confirmed yet. Use the confirmation email first.",
      };
    }
    if (error.code === "invalid_credentials") {
      return { error: "Email or password is not correct." };
    }
    return { error: "Sign-in failed. Try again in a moment." };
  }

  redirect(safeNext(parsed.data.next));
}
