import { useState } from "react";
import { useNavigate } from "react-router";
import { TextField } from "../../components/Fields";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { AuthLayout, FormError } from "./AuthLayout";

/** Shown when someone is logged in but has no business yet (e.g. sign-up was interrupted). */
export function SetupPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <AuthLayout
      title="Name your business"
      intro="This is how we'll refer to you in your posts. You can change it later."
      footer={
        <button type="button" className="btn-text" onClick={() => session.signOut()}>
          Log out
        </button>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setBusy(true);
          try {
            await api.post("/account/setup", { business_name: name.trim() });
            await session.refresh(true);
            navigate("/", { replace: true });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField label="Business name" value={name} onChange={setName} placeholder="Brightside Gutter & Window Co." />
        <FormError message={error} />
        <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
          {busy ? "Setting up…" : "Continue"}
        </button>
      </form>
    </AuthLayout>
  );
}
