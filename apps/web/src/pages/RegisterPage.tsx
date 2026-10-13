import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface FormErrors {
  organizationName?: string;
  email?: string;
  password?: string;
  form?: string;
}

export function RegisterPage() {
  const { status, register } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  if (status === "signedIn") return <Navigate to="/plants" replace />;

  function validate(): FormErrors {
    const found: FormErrors = {};
    if (organizationName.trim().length < 2) {
      found.organizationName =
        "Enter your organization name (at least 2 characters).";
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      found.email = "Enter a valid email address.";
    }
    if (password.length < 8) {
      found.password = "Use at least 8 characters.";
    } else if (password.length > 72) {
      found.password = "Use 72 characters or fewer.";
    }
    return found;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await register(organizationName.trim(), email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: "An account with this email already exists." });
      } else {
        setErrors({ form: "Could not create the account. Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-panel panel">
        <h1>Create an organization</h1>

        {errors.form && (
          <div className="alert-error" role="alert">
            {errors.form}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="organizationName">Organization name</label>
            <input
              id="organizationName"
              className="input"
              autoComplete="organization"
              value={organizationName}
              aria-invalid={errors.organizationName ? true : undefined}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
            {errors.organizationName && (
              <span className="field-error">{errors.organizationName}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              aria-invalid={errors.email ? true : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <span className="field-error">{errors.email}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              aria-invalid={errors.password ? true : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
            style={{ width: "100%" }}
          >
            {submitting ? "Creating..." : "Create organization"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
