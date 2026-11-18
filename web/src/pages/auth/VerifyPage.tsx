import { useId, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useToast } from "../../components/Toast";
import { api } from "../../lib/api";
import { authErrorMessage, finishLogin, finishSignUp, getIdToken, resendSignUp, startLogin } from "../../lib/auth";
import { useSession } from "../../lib/session";
import { AuthLayout, FormError, clearPending, readPending } from "./AuthLayout";

export function VerifyPage() {
  const id = useId();
  const navigate = useNavigate();
  const toast = useToast();
  const session = useSession();
  const pending = readPending();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!pending) return <Navigate to="/login" replace />;
  const isSignup = pending.mode === "signup";

  const submit = async () => {
    setError(undefined);
    setBusy(true);
    try {
      if (isSignup) {
        await finishSignUp(pending.email, code);
        if (pending.businessName) {
          await api.post("/account/setup", { business_name: pending.businessName });
          await session.refresh(true);
        } else {
          await session.refresh();
        }
      } else {
        await finishLogin(code);
        const token = await getIdToken();
        if (!token) throw new Error("Your code was accepted, but your session didn't save. Try logging in again.");
        // Loads the account into the session (errors show here, not as a bounce to Log in).
        await session.refresh();
      }
      clearPending();
      navigate("/", { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      if (isSignup) await resendSignUp(pending.email);
      else await startLogin(pending.email);
      toast(`New code sent to ${pending.email}.`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <AuthLayout
      title="Check your email"
      intro={
        <>
          We sent a code to <strong className="text-ink">{pending.email}</strong>.
        </>
      }
      footer={<Link to={isSignup ? "/signup" : "/login"}>Use a different email</Link>}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length >= 6) submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-code`} className="text-[15px] font-bold">
            Code
          </label>
          <input
            id={`${id}-code`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={8}
            placeholder="Enter code"
            className="min-h-14 w-full rounded-[10px] border border-rule bg-paper px-3 text-center font-mono text-[26px] tracking-[0.3em] placeholder:text-[17px] placeholder:tracking-normal placeholder:text-ink-muted/60"
          />
        </div>
        <FormError message={error} />
        <button type="submit" className="btn-primary" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : isSignup ? "Confirm and continue" : "Log in"}
        </button>
        <button type="button" className="btn-text self-center" onClick={resend}>
          Send a new code
        </button>
      </form>
    </AuthLayout>
  );
}
