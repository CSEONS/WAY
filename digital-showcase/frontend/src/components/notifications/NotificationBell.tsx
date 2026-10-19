import { BellIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../api/client";
import type { AppNotification } from "../../types/models";
import { Badge, ButtonLink, Icon, Modal, cx } from "../../ui";
import styles from "./NotificationBell.module.css";

interface Inbox {
  items: AppNotification[];
  unread: number;
}

const timeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * The bell in the header: notifications from the system (photo checks) and
 * from the admin. The number shows unread ones; opening the list reads them.
 * New ones are picked up on every page change, on return to the tab and once a minute.
 */
export function NotificationBell() {
  const location = useLocation();
  const [inbox, setInbox] = useState<Inbox>({ items: [], unread: 0 });
  const [isOpen, setIsOpen] = useState(false);
  // Highlighted in the open list: what was unread when the owner opened it.
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    api
      .get<Inbox>("/notifications")
      .then((res) => setInbox(res.data))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load, location.pathname]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  function open() {
    const unreadIds = inbox.items.filter((item) => !item.readAt).map((item) => item.id);
    setFresh(new Set(unreadIds));
    setIsOpen(true);
    if (!unreadIds.length) return;
    api
      .post<Inbox>("/notifications/read", { ids: unreadIds })
      .then((res) => setInbox(res.data))
      .catch(() => undefined);
  }

  const count = inbox.unread;

  return (
    <>
      <button
        type="button"
        className={styles.bell}
        aria-label={count ? `Уведомления: новых ${count}` : "Уведомления"}
        title="Уведомления"
        onClick={open}
      >
        <Icon icon={BellIcon} size="sm" />
        {count > 0 && (
          <span className={styles.count} aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {isOpen && (
        <Modal size="sm" title="Уведомления" onClose={() => setIsOpen(false)}>
          {inbox.items.length ? (
            <ul className={styles.list}>
              {inbox.items.map((item) => (
                <li key={item.id} className={cx(styles.item, fresh.has(item.id) && styles.fresh)}>
                  <div className={styles.meta}>
                    <Badge tone={item.source === "ADMIN" ? "accent" : "neutral"}>{item.source === "ADMIN" ? "Администратор" : "Система"}</Badge>
                    <span>{timeFormat.format(new Date(item.createdAt))}</span>
                    {fresh.has(item.id) && <span className={styles.newMark}>новое</span>}
                  </div>
                  <strong className={styles.title}>{item.title}</strong>
                  <p className={styles.body}>{item.body}</p>
                  {item.link && (
                    <ButtonLink variant="secondary" size="sm" to={item.link} className={styles.link} onClick={() => setIsOpen(false)}>
                      Открыть
                    </ButtonLink>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Уведомлений пока нет. Здесь появятся сообщения администратора и результаты проверки фото.</p>
          )}
        </Modal>
      )}
    </>
  );
}
