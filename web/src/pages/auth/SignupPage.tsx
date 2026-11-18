import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { TextField } from "../../components/Fields";
import { authErrorMessage, startSignUp } from "../../lib/auth";
import { AuthLayout, FormError, savePending } from "./AuthLayout";

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ready = name.trim() && email.includes("@") && business.trim();

  return (
    <AuthLayout
      title="Create your account"
      intro="Takes a minute. We'll email you a code to confirm it's you."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
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
            await startSignUp(clean, name.trim());
            savePending({ mode: "signup", email: clean, businessName: business.trim() });
            navigate("/verify");
          } catch (err) {
            setError(authErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField label="Your name" value={name} onChange={setName} placeholder="Dave Smith" />
        <TextField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@yourbusiness.com" />
        <TextField label="Business name" value={business} onChange={setBusiness} placeholder="Brightside Gutter & Window Co." />
        <FormError message={error} />
        <button type="submit" className="btn-primary" disabled={busy || !ready}>
          {busy ? "Sending your code…" : "Send me a code"}
        </button>
      </form>
    </AuthLayout>
  );
}
