import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { TextField } from "../../components/Fields";
import { authErrorMessage, startLogin } from "../../lib/auth";
import { AuthLayout, FormError, savePending } from "./AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <AuthLayout
      title="Log in"
      intro="Enter your email and we'll send you a code. No password needed."
      footer={
        <>
          New to 1Market? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setBusy(true);
          try {
            const clean = email.trim().toLowerCase();
            await startLogin(clean);
            savePending({ mode: "login", email: clean });
            navigate("/verify");
          } catch (err) {
            setError(authErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@yourbusiness.com" />
        <FormError message={error} />
        <button type="submit" className="btn-primary" disabled={busy || !email.includes("@")}>
          {busy ? "Sending your code…" : "Send me a code"}
        </button>
      </form>
    </AuthLayout>
  );
}
