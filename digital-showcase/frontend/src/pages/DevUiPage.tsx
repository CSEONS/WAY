import {
  Analytics01Icon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  ImageAdd01Icon,
  LockKeyIcon,
  EyeIcon,
  Home01Icon,
  Mic01Icon,
  Package01Icon,
  PlusSignIcon,
  PreferenceHorizontalIcon,
  Search01Icon,
  Settings01Icon,
  TextFontIcon
} from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import {
  Badge,
  Breadcrumbs,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  Chip,
  ChipGroup,
  ColorSwatch,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  FileButton,
  Icon,
  IconButton,
  Input,
  LoadingState,
  Menu,
  Modal,
  Notice,
  Page,
  PageHeader,
  ProgressBar,
  SectionLabel,
  SegmentedControl,
  Select,
  Spinner,
  Stat,
  StatusDot,
  Switch,
  Textarea,
  useCopyToClipboard,
  useToast,
  type ButtonVariant
} from "../ui";
import styles from "./DevUiPage.module.css";

const variants: ButtonVariant[] = ["primary", "secondary", "neutral", "outline", "ghost", "danger"];
const sizes = ["XS", "S", "M", "L", "XL"];
const colors = [
  { name: "Чёрный", hex: "#1A1A1A" },
  { name: "Белый", hex: "#FFFFFF" },
  { name: "Красный", hex: "#DC2626" },
  { name: "Синий", hex: "#2563EB" },
  { name: "Бежевый", hex: "#D6BB98" }
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" padding="lg" className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowItems}>{children}</div>
    </div>
  );
}

/** Dev-only catalog of every UI-kit component and state. Route: /dev/ui. */
export default function DevUiPage() {
  const toast = useToast();
  const copy = useCopyToClipboard();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isAgreed, setIsAgreed] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["M"]);
  const [selectedColor, setSelectedColor] = useState("Синий");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [status, setStatus] = useState("AVAILABLE");
  const [title, setTitle] = useState("");

  function toggleSize(size: string) {
    setSelectedSizes((current) => (current.includes(size) ? current.filter((item) => item !== size) : [...current, size]));
  }

  return (
    <Page>
      <PageHeader
        title="UI-kit"
        description="Все компоненты и их состояния. Новые экраны собираются только из них. Правила — styles/STYLE_GUIDE.md."
        back={{ to: "/" }}
      />

      <Section title="Кнопки">
        {variants.map((variant) => (
          <Row key={variant} label={variant}>
            <Button variant={variant} size="sm">
              Маленькая
            </Button>
            <Button variant={variant} icon={PlusSignIcon}>
              Добавить товар
            </Button>
            <Button variant={variant} size="lg">
              Большая
            </Button>
            <Button variant={variant} disabled>
              Недоступна
            </Button>
            <Button variant={variant} loading>
              Сохраняем
            </Button>
          </Row>
        ))}
        <Row label="icon only">
          <IconButton icon={Edit02Icon} label="Редактировать" size="sm" />
          <IconButton icon={Settings01Icon} label="Настройки" />
          <IconButton icon={Delete02Icon} label="Удалить" variant="danger" />
          <IconButton icon={PlusSignIcon} label="Добавить" variant="primary" size="lg" />
        </Row>
        <Row label="файлы">
          <FileButton icon={ImageAdd01Icon} accept="image/*" multiple onFiles={(files) => toast.show(`Выбрано файлов: ${files.length}`)}>
            Добавить картинки
          </FileButton>
        </Row>
        <Row label="меню">
          <Menu
            label="Действия"
            items={[
              { label: "Редактировать", icon: Edit02Icon, onSelect: () => toast.show("Редактировать") },
              { label: "Сменить пароль", icon: LockKeyIcon, onSelect: () => toast.show("Сменить пароль") },
              { label: "Удалить", icon: Delete02Icon, danger: true, onSelect: () => toast.show("Удалить") }
            ]}
          />
        </Row>
        <Row label="ссылки">
          <ButtonLink to="/" variant="secondary" icon={Home01Icon}>
            На главную
          </ButtonLink>
          <ButtonLink href="#" variant="outline" iconEnd={ArrowDown01Icon}>
            Обычная ссылка
          </ButtonLink>
        </Row>
        <Button variant="primary" size="lg" block icon={PlusSignIcon}>
          На всю ширину
        </Button>
      </Section>

      <Section title="Поля ввода">
        <div className={styles.formGrid}>
          <Field label="Название" hint="Так товар увидят покупатели" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, льняное платье" />
          </Field>
          <Field label="Цена" error="Введите цену числом">
            <Input inputMode="numeric" defaultValue="4 500 р" />
          </Field>
          <Field label="Поиск">
            <Input icon={Search01Icon} placeholder="Поиск товара…" />
          </Field>
          <Field label="Наличие">
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "AVAILABLE", label: "В наличии" },
                { value: "CHECK_IN_STORE", label: "Уточнить у продавца" },
                { value: "NOT_AVAILABLE", label: "Нет в наличии" }
              ]}
            />
          </Field>
          <Field label="Описание" className={styles.wide}>
            <Textarea placeholder="Ткань, посадка, уход…" />
          </Field>
          <Field label="Недоступное поле">
            <Input disabled value="Нельзя изменить" readOnly />
          </Field>
        </div>
        <Switch
          checked={isVisible}
          onChange={setIsVisible}
          label="Показывать на витрине"
          description={isVisible ? "Покупатели видят товар" : "Товар скрыт от покупателей"}
        />
        <Switch checked={false} onChange={() => undefined} label="Недоступный переключатель" disabled />
        <Checkbox checked={isAgreed} onChange={setIsAgreed} label="Согласен на обработку персональных данных" />
        <Checkbox checked={false} onChange={() => undefined} label="Флажок с ошибкой" invalid />
      </Section>

      <Section title="Чипы, цвета, режимы">
        <Row label="размеры">
          <ChipGroup label="Размер">
            {sizes.map((size) => (
              <Chip key={size} selected={selectedSizes.includes(size)} onClick={() => toggleSize(size)}>
                {size}
              </Chip>
            ))}
            <Chip dashed icon={PlusSignIcon}>
              Другой
            </Chip>
          </ChipGroup>
        </Row>
        <Row label="фильтры">
          <ChipGroup scroll>
            <Chip icon={PreferenceHorizontalIcon} count={2} iconEnd={ArrowDown01Icon} selected>
              Фильтры
            </Chip>
            <Chip>Платья</Chip>
            <Chip>Джинсы</Chip>
            <Chip disabled>Нет товаров</Chip>
          </ChipGroup>
        </Row>
        <Row label="цвета">
          <ChipGroup label="Цвет">
            {colors.map((color) => (
              <ColorSwatch
                key={color.name}
                color={color.hex}
                label={color.name}
                size="lg"
                selected={selectedColor === color.name}
                onClick={() => setSelectedColor(color.name)}
              />
            ))}
          </ChipGroup>
          {colors.map((color) => (
            <ColorSwatch key={color.name} color={color.hex} label={color.name} size="sm" />
          ))}
        </Row>
        <Row label="режим">
          <SegmentedControl
            label="Способ описания"
            value={mode}
            onChange={setMode}
            options={[
              { value: "text", label: "Текст", icon: TextFontIcon },
              { value: "voice", label: "Голос", icon: Mic01Icon }
            ]}
          />
          <SegmentedControl
            label="Способ описания"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "text", label: "Текст" },
              { value: "voice", label: "Голос" }
            ]}
          />
        </Row>
      </Section>

      <Section title="Сообщения">
        <Notice tone="accent" action={<Button variant="ghost" size="sm">Очистить</Button>}>
          Восстановлен локальный черновик
        </Notice>
        <Notice icon={LockKeyIcon} title="AI недоступен">
          Администратор ещё не подключил AI-заполнение для этого магазина.
        </Notice>
        <Notice tone="success" title="Товар сохраняется в фоне">
          Прогресс можно посмотреть в правом нижнем углу.
        </Notice>
        <Notice tone="warning" title="Магазин архивирован">
          Публичная витрина сейчас недоступна.
        </Notice>
        <Notice tone="danger">Неверный логин или пароль</Notice>
        <ProgressBar value={64} label="Загрузка фото" />
      </Section>

      <Section title="Статусы">
        <Row label="badge">
          <Badge tone="success" icon={CheckmarkCircle02Icon}>
            Опубликован
          </Badge>
          <Badge tone="warning">Черновик</Badge>
          <Badge>Архив</Badge>
          <Badge tone="accent">Новинка</Badge>
          <Badge tone="danger">Нет в наличии</Badge>
        </Row>
        <Row label="status dot">
          <StatusDot tone="success">Активен</StatusDot>
          <StatusDot>В архиве</StatusDot>
          <StatusDot tone="danger">Подписка истекла</StatusDot>
        </Row>
      </Section>

      <Section title="Раскладка">
        <Breadcrumbs
          items={[{ label: "Магазины", to: "/dev/ui", icon: Home01Icon }, { label: "Магазины", to: "/dev/ui" }, { label: "Bibi" }]}
        />
        <div className={styles.statGrid}>
          <Stat icon={Package01Icon} label="Всего товаров" value={24} />
          <Stat icon={EyeIcon} label="Просмотры магазина" value={340} />
          <Stat icon={Analytics01Icon} label="Просмотры товаров" value="1 204" />
        </div>
        <SectionLabel>Section label</SectionLabel>
        <div className={styles.cardGrid}>
          <Card>
            <CardHeader title="Card header" description="Описание карточки" actions={<Button size="sm">Действие</Button>} />
            Card outlined, padding md
          </Card>
          <Card variant="muted" padding="sm">
            Card muted, padding sm
          </Card>
        </div>
      </Section>

      <Section title="Иконки">
        <Row label="xs / sm / md / lg">
          <Icon icon={Settings01Icon} size="xs" />
          <Icon icon={Settings01Icon} size="sm" />
          <Icon icon={Settings01Icon} size="md" />
          <Icon icon={Settings01Icon} size="lg" />
          <Spinner size="sm" />
          <Spinner />
          <Spinner size="lg" />
        </Row>
      </Section>

      <Section title="Состояния экрана">
        <div className={styles.cardGrid}>
          <Card>
            <EmptyState
              title="Нет товаров"
              description="Добавьте первый товар, чтобы витрина начала наполняться."
              action={
                <Button variant="primary" icon={PlusSignIcon}>
                  Добавить товар
                </Button>
              }
            />
          </Card>
          <Card>
            <ErrorState onRetry={() => toast.show("Повторяем запрос")} />
          </Card>
          <Card>
            <LoadingState />
          </Card>
        </div>
      </Section>

      <Section title="Модальные окна и уведомления">
        <Row label="modal">
          <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
            Открыть окно
          </Button>
          <Button variant="danger" onClick={() => setIsConfirmOpen(true)}>
            Удалить товар
          </Button>
        </Row>
        <Row label="toast">
          <Button onClick={() => toast.show("Товар сохранён", { tone: "success" })}>Успех</Button>
          <Button onClick={() => toast.show("Не удалось сохранить", { tone: "danger" })}>Ошибка</Button>
          <Button icon={Copy01Icon} onClick={() => copy(`${location.origin}/m/demo`, "Ссылка скопирована")}>
            Копировать ссылку
          </Button>
        </Row>
      </Section>

      {isModalOpen && (
        <Modal
          title="QR-код витрины"
          description={`${location.origin}/m/demo`}
          onClose={() => setIsModalOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => copy(`${location.origin}/m/demo`, "Ссылка скопирована")}>
                Копировать
              </Button>
              <Button variant="primary" onClick={() => setIsModalOpen(false)}>
                Готово
              </Button>
            </>
          }
        >
          <Field label="Подпись к ссылке">
            <Input placeholder="Например, «Новая коллекция»" />
          </Field>
        </Modal>
      )}
      {isConfirmOpen && (
        <ConfirmModal
          title="Удалить товар?"
          description="Товар «Льняное платье» исчезнет из кабинета и публичной витрины. Это действие нельзя отменить."
          confirmLabel="Удалить"
          danger
          onCancel={() => setIsConfirmOpen(false)}
          onConfirm={async () => {
            await new Promise((resolve) => window.setTimeout(resolve, 800));
            setIsConfirmOpen(false);
            toast.show("Товар удалён");
          }}
        />
      )}
    </Page>
  );
}
