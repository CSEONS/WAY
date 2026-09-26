import { useEffect, useRef, useState } from "react";
import type { Product } from "../../types/models";
import {
  ASK_SELLER,
  LONG_PRESS_MS,
  createId,
  initialColorHistory,
  initialPriceHistory,
  initialSizeHistory,
  initialVariants,
  normalizeHex,
  normalizeSize,
  readStoredList,
  uniqueColorHistory
} from "./helpers";
import type { ColorHistoryItem, ProductDraft, SavedProductFormDraft, VariantFormRow, VariantModalType } from "./types";

function usePersistedList<T>(key: string | undefined, fallback: () => T[]) {
  const [list, setList] = useState<T[]>(() => readStoredList<T>(key) ?? fallback());
  useEffect(() => {
    if (key) localStorage.setItem(key, JSON.stringify(list));
  }, [key, list]);
  return [list, setList] as const;
}

/**
 * State of the «Комбинации товара» block: the added color × size × price rows,
 * the remembered color/size/price values (kept in localStorage per form) and
 * the current selection in the builder.
 */
export function useVariantBuilder(initial: Product | undefined, savedDraft: SavedProductFormDraft | null, draftKey?: string) {
  const [variants, setVariants] = useState<VariantFormRow[]>(() => (savedDraft?.variants?.length ? savedDraft.variants : initialVariants(initial)));
  const [colorHistory, setColorHistory] = usePersistedList<ColorHistoryItem>(draftKey && `${draftKey}:colors`, () => initialColorHistory(initial, savedDraft));
  const [sizeHistory, setSizeHistory] = usePersistedList<string>(draftKey && `${draftKey}:sizes`, () => initialSizeHistory(initial, savedDraft));
  const [priceHistory, setPriceHistory] = usePersistedList<string>(draftKey && `${draftKey}:prices`, () => initialPriceHistory(initial, savedDraft));
  const [selectedColorName, setSelectedColorName] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [modal, setModal] = useState<VariantModalType | null>(null);
  const [draftColorHex, setDraftColorHex] = useState("#94A3B8");
  const [draftSize, setDraftSize] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [pipetteImageId, setPipetteImageId] = useState<string | null>(null);
  const [pressingKey, setPressingKey] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);

  const selectedColor =
    selectedColorName === ASK_SELLER
      ? { name: ASK_SELLER, hex: "" }
      : selectedColorName
        ? colorHistory.find((color) => color.name === selectedColorName) ?? null
        : null;
  const canAddVariant = Boolean(selectedColor && selectedSize && (selectedPrice ?? "").trim());

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    };
  }, []);

  function rememberColor(color: ColorHistoryItem) {
    const normalized = { name: color.name.trim(), hex: normalizeHex(color.hex) };
    if (!normalized.name) return;
    setColorHistory((current) => [normalized, ...current.filter((item) => item.name.toLowerCase() !== normalized.name.toLowerCase())]);
  }

  function rememberSize(value: string) {
    const normalized = normalizeSize(value);
    if (!normalized) return;
    setSizeHistory((current) => [normalized, ...current.filter((item) => item !== normalized)]);
  }

  function rememberPrice(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    setPriceHistory((current) => [normalized, ...current.filter((item) => item !== normalized)]);
  }

  function deleteColor(name: string) {
    setColorHistory((current) => current.filter((color) => color.name !== name));
    setSelectedColorName((current) => (current === name ? null : current));
  }

  function deleteSize(value: string) {
    setSizeHistory((current) => current.filter((size) => size !== value));
    setSelectedSize((current) => (current === value ? null : current));
  }

  function deletePrice(value: string) {
    setPriceHistory((current) => current.filter((price) => price !== value));
    setSelectedPrice((current) => (current === value ? null : current));
  }

  function toggle(setter: (update: (current: string | null) => string | null) => void, value: string) {
    setter((current) => (current === value ? null : value));
  }

  function beginLongPress(key: string, onLongPress: () => void) {
    setPressingKey(key);
    longPressFiredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setPressingKey(null);
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressingKey(null);
  }

  function endLongPress(onClick: () => void) {
    const firedDuringPress = longPressFiredRef.current;
    cancelLongPress();
    if (!firedDuringPress) onClick();
  }

  function openModal(type: VariantModalType, defaultPipetteImageId: string | null) {
    setModal(type);
    if (type === "color") {
      setDraftColorHex("#94A3B8");
      setPipetteImageId((current) => current ?? defaultPipetteImageId);
    }
    if (type === "size") setDraftSize("");
    if (type === "price") setDraftPrice("");
  }

  function closeModal() {
    setModal(null);
  }

  function updateVariant(id: string, patch: Partial<VariantFormRow>) {
    setVariants((current) => current.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  }

  function removeVariant(id: string) {
    setVariants((current) => current.filter((variant) => variant.id !== id));
  }

  function addVariantFromSelection() {
    if (!selectedColor || !selectedSize) return;
    const nextPrice = (selectedPrice ?? "").trim();
    const payload = {
      colorName: selectedColor.name,
      colorHex: selectedColor.name === ASK_SELLER ? "" : normalizeHex(selectedColor.hex),
      size: selectedSize,
      price: nextPrice
    };

    setVariants((current) => {
      const existing = current.findIndex((variant) => variant.colorName === payload.colorName && variant.size === payload.size);
      if (existing >= 0) return current.map((variant, index) => (index === existing ? { ...variant, ...payload } : variant));
      return [...current, { id: createId(), ...payload }];
    });

    if (selectedColor.name !== ASK_SELLER) rememberColor(selectedColor);
    if (selectedSize !== ASK_SELLER) rememberSize(selectedSize);
    if (nextPrice && nextPrice !== ASK_SELLER) rememberPrice(nextPrice);
    setSelectedSize(null);
    setSelectedPrice(null);
  }

  function submitNewColor() {
    const hex = normalizeHex(draftColorHex);
    rememberColor({ name: hex, hex });
    setSelectedColorName(hex);
    closeModal();
  }

  function submitNewSize() {
    const value = normalizeSize(draftSize);
    if (!value) return;
    rememberSize(value);
    setSelectedSize(value);
    closeModal();
  }

  function submitNewPrice() {
    const value = draftPrice.trim();
    if (!value) return;
    rememberPrice(value);
    setSelectedPrice(value);
    closeModal();
  }

  /** Replaces the rows with an AI draft and remembers its values for quick picks. */
  function applyDraftVariants(draftVariants: ProductDraft["variants"]) {
    if (!draftVariants?.length) return;
    const nextVariants = draftVariants.map((variant) => ({
      id: createId(),
      colorName: variant.colorName,
      colorHex: variant.colorHex ?? "#2779a7",
      size: variant.size,
      price: variant.price?.toString() ?? ""
    }));
    setVariants(nextVariants);
    setColorHistory((current) => {
      const merged = uniqueColorHistory([
        ...nextVariants,
        ...current.map((color) => ({ id: createId(), colorName: color.name, colorHex: color.hex, size: "", price: "" }))
      ]);
      return merged.length ? merged : current;
    });
    setSizeHistory((current) => [...new Set([...nextVariants.map((variant) => normalizeSize(variant.size)).filter(Boolean), ...current])]);
    setPriceHistory((current) => [...new Set([...nextVariants.map((variant) => variant.price.trim()).filter(Boolean), ...current])]);
  }

  return {
    variants,
    colorHistory,
    sizeHistory,
    priceHistory,
    selectedColorName,
    selectedSize,
    selectedPrice,
    canAddVariant,
    modal,
    draftColorHex,
    draftSize,
    draftPrice,
    pipetteImageId,
    pressingKey,
    setDraftColorHex,
    setDraftSize,
    setDraftPrice,
    setPipetteImageId,
    setSelectedColorName,
    setSelectedSize,
    setSelectedPrice,
    toggleColor: (name: string) => toggle(setSelectedColorName, name),
    toggleSize: (size: string) => toggle(setSelectedSize, size),
    togglePrice: (price: string) => toggle(setSelectedPrice, price),
    deleteColor,
    deleteSize,
    deletePrice,
    beginLongPress,
    cancelLongPress,
    endLongPress,
    openModal,
    closeModal,
    updateVariant,
    removeVariant,
    addVariantFromSelection,
    submitNewColor,
    submitNewSize,
    submitNewPrice,
    applyDraftVariants
  };
}

export type VariantBuilderState = ReturnType<typeof useVariantBuilder>;
