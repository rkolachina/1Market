// Passwordless login with Cognito (email + one-time code), via Amplify Auth.
import { Amplify } from "aws-amplify";
import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  signIn,
  signOut as amplifySignOut,
  signUp,
} from "aws-amplify/auth";

const userPoolId = import.meta.env.VITE_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_USER_POOL_CLIENT_ID as string | undefined;

/** False when Cognito isn't configured (local dev without auth): the app skips login. */
export const authEnabled = Boolean(userPoolId && userPoolClientId);

if (authEnabled) {
  Amplify.configure({
    Auth: { Cognito: { userPoolId: userPoolId!, userPoolClientId: userPoolClientId!, loginWith: { email: true }, signUpVerificationMethod: "code" } },
  });
}

export async function getIdToken(forceRefresh = false): Promise<string | undefined> {
  if (!authEnabled) return undefined;
  try {
    const session = await fetchAuthSession({ forceRefresh });
    return session.tokens?.idToken?.toString();
  } catch {
    return undefined;
  }
}

/** Step 1 of sign-up: create the account; Cognito emails a code. */
export async function startSignUp(email: string, name: string) {
  await signUp({
    username: email,
    options: { userAttributes: { email, name }, autoSignIn: { authFlowType: "USER_AUTH" } },
  });
}

/** Step 2 of sign-up: confirm the emailed code, then sign in automatically. */
export async function finishSignUp(email: string, code: string) {
  const res = await confirmSignUp({ username: email, confirmationCode: code });
  if (res.nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
    const signedIn = await autoSignIn();
    if (!signedIn.isSignedIn) throw new Error("We couldn't sign you in. Try logging in.");
  }
}

export const resendSignUp = (email: string) => resendSignUpCode({ username: email });

/** Step 1 of log in: ask Cognito to email a one-time code. */
export async function startLogin(email: string) {
  await amplifySignOut().catch(() => {}); // clear any half-finished session
  const res = await signIn({ username: email, options: { authFlowType: "USER_AUTH", preferredChallenge: "EMAIL_OTP" } });
  if (res.nextStep.signInStep !== "CONFIRM_SIGN_IN_WITH_EMAIL_CODE") {
    throw new Error("We couldn't find an account for that email. Check it, or create an account first.");
  }
}

/** Step 2 of log in: confirm the emailed code. */
export async function finishLogin(code: string) {
  const res = await confirmSignIn({ challengeResponse: code });
  if (!res.isSignedIn) throw new Error("That code didn't work. Check it and try again.");
}

export const signOut = () => amplifySignOut();

/** Friendly message for Cognito errors. */
export function authErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? "";
  switch (name) {
    case "CodeMismatchException":
      return "That code didn't work. Check it and try again.";
    case "ExpiredCodeException":
      return "That code expired. Send a new one.";
    case "UsernameExistsException":
      return "There's already an account with that email. Log in instead.";
    case "UserNotFoundException":
    case "NotAuthorizedException":
      return "We couldn't log you in with that email. Check it, or sign up.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many tries. Wait a few minutes and try again.";
    case "UserNotConfirmedException":
      return "Finish signing up first. Check your email for the code.";
    default:
      return (err as Error)?.message || "Something went wrong. Try again.";
  }
}
