import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../components/Toast";

export function SettingsAccount() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.patch("/me/profile", {
        name,
        ...(password ? { password } : {}),
      }),
    onSuccess: async () => {
      setPassword("");
      await refresh();
      toast("Profile saved");
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not save your profile", "error"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account on this workspace.</p>
        </div>
      </div>

      <form className="card form-card" style={{ maxWidth: 560 }} onSubmit={onSubmit}>
        <div className="f-sec">
          <span className="f-lab">Account</span>
          <div className="field">
            <input value={user?.email ?? ""} disabled />
            <small>Email — your sign-in identity, fixed</small>
          </div>
          <div className="field">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            <small>Display name</small>
          </div>
        </div>

        <div className="f-sec">
          <span className="f-lab">Security</span>
          <div className="field">
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <small>New password — leave empty to keep the current one (min 8 characters)</small>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}
