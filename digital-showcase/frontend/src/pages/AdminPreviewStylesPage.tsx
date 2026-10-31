import { ArrowDown01Icon, ArrowUp01Icon, Edit02Icon, Image01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminPreviewStyle } from "../types/models";
import { Badge, ButtonLink, Card, EmptyState, ErrorState, Icon, IconButton, LoadingState, Page, PageHeader, useToast } from "../ui";
import styles from "./AdminPreviewStylesPage.module.css";

/**
 * «Стили ИИ-превью»: the looks owners pick from in «Превью с ИИ», in the order
 * they see them. Each with its sample, whether owners see it and whether it
 * has text; one style at a time is edited (and tried) on its own page.
 */
export function AdminPreviewStylesPage() {
  const toast = useToast();
  const [list, setList] = useState<AdminPreviewStyle[] | null>();

  const reload = useCallback(() => {
    setList(undefined);
    api
      .get<AdminPreviewStyle[]>("/admin/preview-styles")
      .then((res) => setList(res.data))
      .catch(() => setList(null));
  }, []);

  useEffect(reload, [reload]);

  async function move(index: number, step: -1 | 1) {
    if (!list) return;
    const ids = list.map((style) => style.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    try {
      setList((await api.post<AdminPreviewStyle[]>("/admin/preview-styles/order", { ids })).data);
    } catch {
      toast.show("Не удалось поменять порядок", { tone: "danger" });
    }
  }

  return (
    <Page>
      <PageHeader
        title="Стили ИИ-превью"
        description="Из них владелец выбирает, как будет выглядеть обложка товара. Новый стиль сначала попробуйте на своём фото, потом включите"
        back={{ to: "/admin?tab=sections", label: "В админку" }}
        actions={
          <ButtonLink variant="primary" icon={PlusSignIcon} to="/admin/preview-styles/new">
            Добавить
          </ButtonLink>
        }
      />

      {list === null && <ErrorState onRetry={reload} />}
      {list === undefined && <LoadingState />}
      {list && !list.length && <EmptyState title="Стилей нет" description="Добавьте первый — без него превью рисуются в исходном рекламном стиле." />}
      {list && list.length > 0 && (
        <div className={styles.grid}>
          {list.map((style, index) => (
            <Card key={style.id} padding="md" className={styles.card}>
              {style.sample ? (
                <img className={styles.sample} src={style.sample} alt="" />
              ) : (
                <span className={`${styles.sample} ${styles.empty}`} aria-hidden="true">
                  <Icon icon={Image01Icon} size="lg" />
                </span>
              )}
              <div className={styles.text}>
                <strong>{style.name}</strong>
                {style.description && <span className={styles.description}>{style.description}</span>}
              </div>
              <div className={styles.badges}>
                {style.isActive ? <Badge tone="success">Виден владельцам</Badge> : <Badge tone="warning">Скрыт</Badge>}
                <Badge>{style.textLayout.trim() ? "С надписями" : "Без надписей"}</Badge>
              </div>
              <div className={styles.actions}>
                <ButtonLink variant="secondary" icon={Edit02Icon} to={`/admin/preview-styles/${style.id}/edit`} className={styles.edit}>
                  Редактировать
                </ButtonLink>
                <IconButton icon={ArrowUp01Icon} label="Раньше в списке" variant="outline" disabled={index === 0} onClick={() => move(index, -1)} />
                <IconButton icon={ArrowDown01Icon} label="Позже в списке" variant="outline" disabled={index === list.length - 1} onClick={() => move(index, 1)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
