import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cardTypeForCategory } from "../host/cardModel";
import { useHost } from "../host/HostContext";

/**
 * A button that asks for the card type as it is pressed.
 *
 * The type is chosen per card from the campaign's categories instead of being
 * inherited from a global setting, so a card is never filed under a stale
 * choice. The parent owns `open` so a form can raise the same menu on Enter.
 *
 * The menu renders in a portal because the rail scrolls: an in-flow dropdown
 * would be clipped by it.
 */
export function CardTypeButton({
  label,
  open,
  onOpenChange,
  onPick,
  disabled = false,
  className = "",
  ariaLabel,
  title,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (category: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const { snap } = useHost();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const categories = snap.campaign?.cardCategories ?? [];
  // No type to pick, no card: the menu never offers a nameless fallback.
  const hasTypes = categories.length > 0;

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      const width = Math.max(rect.width, 160);
      setMenuStyle({
        left: `${String(Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)))}px`,
        top: `${String(rect.bottom + 6)}px`,
        minWidth: `${String(width)}px`,
      });
    }
    const onPointerDown = (event: PointerEvent): void => {
      const node = event.target;
      if (!(node instanceof Node)) {
        return;
      }
      if (buttonRef.current?.contains(node) === true || menuRef.current?.contains(node) === true) {
        return;
      }
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    // The menu is fixed to the button's box, so a scrolling panel would leave
    // it floating in the wrong place.
    const onScroll = (event: Event): void => {
      const node = event.target;
      if (node instanceof Node && menuRef.current?.contains(node) === true) {
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onOpenChange]);

  // The menu only exists on the render after the anchor box is measured.
  useEffect(() => {
    if (open) {
      firstItemRef.current?.focus();
    }
  }, [open, menuStyle]);

  return (
    <span className={`card-type-button${className.length > 0 ? ` ${className}` : ""}`}>
      <button
        type="button"
        ref={buttonRef}
        disabled={disabled || !hasTypes}
        aria-label={ariaLabel ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={hasTypes ? title : "This campaign has no card types yet"}
        onClick={() => onOpenChange(!open)}
      >
        {label}
      </button>
      {open && menuStyle !== null && hasTypes
        ? createPortal(
            <ul
              className="card-type-menu"
              role="menu"
              aria-label={`Card type for ${label}`}
              style={menuStyle}
              ref={menuRef}
            >
              {categories.map((category, index) => (
                <li key={category} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    ref={index === 0 ? firstItemRef : undefined}
                    onClick={() => {
                      onOpenChange(false);
                      onPick(category);
                    }}
                  >
                    <span
                      className={`card-type-swatch is-${cardTypeForCategory(category)}`}
                      aria-hidden="true"
                    />
                    {category}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </span>
  );
}
