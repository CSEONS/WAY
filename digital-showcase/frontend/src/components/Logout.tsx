import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { forgetPhone } from "../utils/push";

/**
 * «Выйти» is a page of its own: signing out is a navigation like any other,
 * so a screen with unsaved work can ask first and keep the session if the
 * owner stays.
 */
export function Logout({ isLoading, onLogout }: { isLoading: boolean; onLogout: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Opened by a direct link: the session check must not sign the user back in afterwards.
    if (isLoading) return;
    let isCurrent = true;
    // The owner's notifications stop coming to this phone; a slow network doesn't hold up signing out.
    const timeout = new Promise((resolve) => window.setTimeout(resolve, 3000));
    Promise.race([forgetPhone().catch(() => undefined), timeout]).then(() => {
      if (!isCurrent) return;
      onLogout();
      navigate("/login", { replace: true });
    });
    return () => {
      isCurrent = false;
    };
  }, [isLoading, onLogout, navigate]);

  return null;
}
