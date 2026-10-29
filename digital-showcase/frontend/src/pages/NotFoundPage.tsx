import { FileNotFoundIcon, Home01Icon } from "@hugeicons/core-free-icons";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import type { User } from "../types/models";
import { ButtonLink, EmptyState, Page } from "../ui";
import styles from "./NotFoundPage.module.css";

/**
 * Any address no page answers: an old link or a typo. Back to the landing,
 * and for someone signed in — to their cabinet or the admin panel.
 */
export function NotFoundPage({ user }: { user: User | null }) {
  useDocumentMeta("Страница не найдена");
  const home = user?.role === "ADMIN" ? { to: "/admin", label: "В админку" } : user?.role === "OWNER" ? { to: "/dashboard", label: "В кабинет" } : null;
  return (
    <Page width="narrow">
      <EmptyState
        icon={FileNotFoundIcon}
        title="Страница не найдена"
        description="Такой страницы нет: возможно, ссылка устарела или в адресе опечатка."
        action={
          <div className={styles.actions}>
            {home && (
              <ButtonLink variant="primary" to={home.to}>
                {home.label}
              </ButtonLink>
            )}
            <ButtonLink variant={home ? "secondary" : "primary"} icon={Home01Icon} to="/">
              На главную
            </ButtonLink>
          </div>
        }
      />
    </Page>
  );
}
