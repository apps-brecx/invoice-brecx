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
      toast("Profile saved.");
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "Could not save your profile.", "error"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      <div className="head">
        <div>
          <h2>Your account</h2>
          <div className="desc">Profile details for {user?.email}.</div>
        </div>
      </div>
      <form className="body" onSubmit={onSubmit}>
        <div className="field-row">
          <div>
            <div className="label">Email</div>
            <div className="hint">Your sign-in identity — it can't be changed here.</div>
          </div>
          <input className="input" value={user?.email ?? ""} disabled />
        </div>
        <div className="field-row">
          <div>
            <div className="label">Display name</div>
            <div className="hint">Shown in the sidebar and on invoices you create.</div>
          </div>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <div>
            <div className="label">New password</div>
            <div className="hint">Leave empty to keep your current password. Min 8 characters.</div>
          </div>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="btn primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
