import type { ProductStatus } from "../../types/models";
import { Card, CardHeader, SectionLabel, SegmentedControl, Switch } from "../../ui";
import styles from "./ProductForm.module.css";

interface StatusCardProps {
  isVisible: boolean;
  status: ProductStatus;
  onVisibleChange: (isVisible: boolean) => void;
  onStatusChange: (status: ProductStatus) => void;
}

/** Two separate questions instead of one «Опубликован / Черновик / Архив» status. */
export function StatusCard({ isVisible, status, onVisibleChange, onStatusChange }: StatusCardProps) {
  return (
    <Card as="section" className={styles.section}>
      <CardHeader title="Показ и наличие" />
      <Switch
        checked={isVisible}
        onChange={onVisibleChange}
        label="Показывать на витрине"
        description={isVisible ? "Покупатели увидят товар сразу после сохранения" : "Товар сохранится как черновик — покупатели его не увидят"}
      />
      <div className={styles.builderBlock}>
        <SectionLabel>Наличие</SectionLabel>
        <SegmentedControl
          label="Наличие"
          value={status}
          onChange={onStatusChange}
          options={[
            { value: "AVAILABLE", label: "В наличии" },
            { value: "CHECK_IN_STORE", label: "Уточнять" },
            { value: "NOT_AVAILABLE", label: "Нет в наличии" }
          ]}
        />
      </div>
    </Card>
  );
}
