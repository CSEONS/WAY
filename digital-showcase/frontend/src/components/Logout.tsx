import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

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
    onLogout();
    navigate("/login", { replace: true });
  }, [isLoading, onLogout, navigate]);

  return null;
}
