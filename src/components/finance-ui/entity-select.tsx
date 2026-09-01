// <EntitySelect /> - the floating ledger-entity picker shared by the Finance
// and Procurement console header. A tenant with zero or one active entity has
// no choice to make, so the control only appears once a second entity exists.
// The selected code is persisted and threaded into every entity-scoped request.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { selectEntityCode, setSelectedEntity } from "@/redux/features/finance/entity-slice";
import { useGetEntitiesQuery } from "@/redux/services/finance/entity-api";
import { toArray } from "@/redux/services/finance/api-types";
import type { LedgerEntity } from "@/redux/services/finance/entity-types";

const TOP_REVEAL_PX = 24;
const HIDE_AFTER_PX = 72;
const HIDE_TRAVEL_PX = 16;
const REVEAL_TRAVEL_PX = 10;

export function shouldShowEntitySwitcher(entityCount: number) {
  return entityCount > 1;
}

export function shouldSuspendEntitySwitcher({
  searchResultsOpen,
  mobileSearchOpen,
  activeToastCount,
}: {
  searchResultsOpen: boolean;
  mobileSearchOpen: boolean;
  activeToastCount: number;
}) {
  return searchResultsOpen || mobileSearchOpen || activeToastCount > 0;
}

export function shouldExpandEntitySwitcher({
  open,
  hovered,
  focused,
  collapsedAfterSelection,
}: {
  open: boolean;
  hovered: boolean;
  focused: boolean;
  collapsedAfterSelection: boolean;
}) {
  return open || hovered || (focused && !collapsedAfterSelection);
}

export function EntitySelect({ suspended = false }: { suspended?: boolean }) {
  const dispatch = useAppDispatch();
  const code = useAppSelector(selectEntityCode);
  const { data, isLoading } = useGetEntitiesQuery({ is_active: true });

  // Empty Finance lists can arrive as `{}` from the shared response helper;
  // normalize before using array methods or deciding whether a choice exists.
  const entities = useMemo(() => toArray(data?.data), [data]);
  const hasMultipleEntities = shouldShowEntitySwitcher(entities.length);
  const selected = entities.find((entity) => entity.code === code) ?? entities[0];

  // Auto-select the first active entity when none is chosen (or the persisted
  // one no longer exists), so callers always have an entity to scope by.
  useEffect(() => {
    if (isLoading || entities.length === 0) return;
    const stillValid = code && entities.some((e) => e.code === code);
    if (!stillValid) dispatch(setSelectedEntity(entities[0].code));
  }, [isLoading, entities, code, dispatch]);

  if (isLoading) return null;
  if (!hasMultipleEntities || !selected) return null;

  return (
    <MultiEntitySelect
      entities={entities}
      selected={selected}
      selectedCode={code}
      suspended={suspended}
      onSelect={(value) => dispatch(setSelectedEntity(value))}
    />
  );
}

function MultiEntitySelect({
  entities,
  selected,
  selectedCode,
  suspended,
  onSelect,
}: {
  entities: LedgerEntity[];
  selected: LedgerEntity;
  selectedCode: string | null;
  suspended: boolean;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [collapsedAfterSelection, setCollapsedAfterSelection] = useState(false);
  const [scrollVisible, setScrollVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollDirection = useRef<"up" | "down" | null>(null);
  const directionTravel = useRef(0);
  const interactionActive = open || hovered || focused;
  const expanded = shouldExpandEntitySwitcher({
    open,
    hovered,
    focused,
    collapsedAfterSelection,
  });

  useEffect(() => {
    lastScrollY.current = Math.max(window.scrollY, 0);

    const onScroll = () => {
      const nextY = Math.max(window.scrollY, 0);
      const delta = nextY - lastScrollY.current;
      lastScrollY.current = nextY;

      if (nextY <= TOP_REVEAL_PX) {
        scrollDirection.current = null;
        directionTravel.current = 0;
        setScrollVisible(true);
        return;
      }

      if (interactionActive || Math.abs(delta) < 0.5) return;

      const nextDirection = delta > 0 ? "down" : "up";
      if (scrollDirection.current !== nextDirection) {
        scrollDirection.current = nextDirection;
        directionTravel.current = 0;
      }
      directionTravel.current += Math.abs(delta);

      if (
        nextDirection === "down" &&
        nextY > HIDE_AFTER_PX &&
        directionTravel.current >= HIDE_TRAVEL_PX
      ) {
        setScrollVisible(false);
        directionTravel.current = 0;
      } else if (
        nextDirection === "up" &&
        directionTravel.current >= REVEAL_TRAVEL_PX
      ) {
        setScrollVisible(true);
        directionTravel.current = 0;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [interactionActive]);

  const visible = scrollVisible && !suspended;

  return (
    <div
      data-entity-switcher
      data-visible={visible}
      data-expanded={expanded}
      className={`pointer-events-auto transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"
      }`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <Select
        value={selectedCode ?? undefined}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setCollapsedAfterSelection(false);
        }}
        onValueChange={(value) => {
          // Radix returns focus to the trigger after a choice. Keep that focus
          // for keyboard users, but collapse the visual back to the code.
          setCollapsedAfterSelection(true);
          setHovered(false);
          onSelect(value);
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label={`Active entity: ${selected.name}. Change entity`}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setCollapsedAfterSelection(false);
          }}
          className="relative h-8.5 min-w-0 overflow-hidden rounded-full border border-white/90 bg-white/[0.92] px-3 font-mont text-xs font-semibold text-gray-900 ring-1 ring-black/5 transition-[width,color,box-shadow] duration-200 before:pointer-events-none before:absolute before:inset-px before:rounded-[inherit] before:bg-gradient-to-br before:from-white/80 before:via-white/25 before:to-primary/[0.10] after:pointer-events-none after:absolute after:left-3 after:right-8 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white after:to-transparent focus-visible:border-white focus-visible:ring-3 focus-visible:ring-primary/20 motion-reduce:transition-none supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:backdrop-blur-[20px] supports-[backdrop-filter]:backdrop-saturate-150 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(255,255,255,0.24),0_10px_28px_rgba(15,23,42,0.14)] [&>svg]:relative [&>svg]:z-10 [&>svg]:size-4 [&>svg]:rounded-full [&>svg]:bg-white/65 [&>svg]:p-0.5 [&>svg]:text-gray-600 [&>svg]:shadow-[0_1px_4px_rgba(15,23,42,0.10)]"
        >
          <SelectValue placeholder="Select entity">
            <span className="relative z-10 flex min-w-0 items-center">
              <span className="shrink-0 tracking-[0.04em]">{selected.code}</span>
              <span
                aria-hidden={!expanded}
                className={`overflow-hidden whitespace-nowrap font-medium text-gray-600 transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none ${
                  expanded ? "ml-1.5 max-w-52 opacity-100" : "ml-0 max-w-0 opacity-0"
                }`}
              >
                <span className="mr-1.5 text-gray-400">·</span>
                {selected.name}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="center"
          className="min-w-64 rounded-xl border-white/85 bg-white/95 font-mont shadow-[0_18px_45px_rgba(15,23,42,0.16)] supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:backdrop-saturate-150"
        >
          {entities.map((entity) => (
            <SelectItem
              key={entity.code}
              value={entity.code}
              className="rounded-lg font-mont data-[state=checked]:bg-primary/5"
            >
              <span className="font-semibold">{entity.code}</span>
              <span className="ml-2 text-gray-500">{entity.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
