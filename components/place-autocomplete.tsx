"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, MapPinIcon, SearchIcon } from "lucide-react";

import {
  listCountryOptions,
  requestNewPlace,
  searchPlacesAction,
  type PlaceOption,
} from "@/app/actions/places";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectedPlace = {
  id: number;
  name: string;
  country_code: string | null;
};

type Item = { value: number; label: string; place: PlaceOption };

const DEBOUNCE_MS = 200;

/**
 * Birthplace / place-of-death picker backed by `places`. The field is only
 * valid once a real `places.id` is chosen — there is no free-text fallback.
 * Admins get a "can't find it?" escape hatch that adds a place row.
 */
export function PlaceAutocomplete({
  id,
  value,
  initialLabel,
  onChange,
  isAdmin = false,
  disabled = false,
  invalid = false,
  placeholder = "Search for a place…",
}: {
  id?: string;
  value: number | null;
  initialLabel?: string | null;
  onChange: (place: SelectedPlace | null) => void;
  isAdmin?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = React.useRef(0);

  const selected: Item | null = React.useMemo(() => {
    if (value == null) return null;
    const known = items.find((i) => i.value === value);
    if (known) return known;
    return {
      value,
      label: initialLabel || "Selected place",
      place: {
        id: value,
        name: initialLabel || "",
        admin1_code: null,
        country_code: null,
        label: initialLabel || "",
      },
    };
  }, [value, items, initialLabel]);

  const runSearch = React.useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const mine = ++reqId.current;
      const hits = await searchPlacesAction(q);
      if (mine !== reqId.current) return;
      setItems(hits.map((h) => ({ value: h.id, label: h.label, place: h })));
      setLoading(false);
    }, DEBOUNCE_MS);
  }, []);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const options: Item[] = React.useMemo(() => {
    if (selected && !items.some((i) => i.value === selected.value)) {
      return [selected, ...items];
    }
    return items;
  }, [items, selected]);

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox.Root
        items={options}
        value={selected}
        filter={null}
        isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
        onValueChange={(v: Item | null) => {
          onChange(
            v
              ? { id: v.place.id, name: v.place.name, country_code: v.place.country_code }
              : null,
          );
        }}
        onInputValueChange={(q: string) => {
          setQuery(q);
          runSearch(q);
        }}
      >
        <div
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            invalid && "border-destructive focus-within:ring-destructive/40",
            disabled && "opacity-50",
          )}
        >
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Combobox.Input
            id={id}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50">
            <Combobox.Popup className="max-h-72 w-[var(--anchor-width)] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
              {loading ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">Searching…</p>
              ) : null}
              <Combobox.Empty className="px-2 py-2 text-sm text-muted-foreground">
                {query.trim().length < 2
                  ? "Type at least two letters."
                  : "No matching place."}
              </Combobox.Empty>
              <Combobox.List>
                {(item: Item) => (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  >
                    <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <Combobox.ItemIndicator>
                      <CheckIcon className="size-4" aria-hidden />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {isAdmin ? (
        <button
          type="button"
          className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setAddOpen(true)}
        >
          Can’t find it? Add a place
        </button>
      ) : null}

      {isAdmin ? (
        <AddPlaceDialog
          key={addOpen ? `open:${query}` : "closed"}
          open={addOpen}
          initialName={query}
          onOpenChange={setAddOpen}
          onAdded={(place) => {
            setItems((prev) => [
              { value: place.id, label: place.label, place },
              ...prev,
            ]);
            onChange({
              id: place.id,
              name: place.name,
              country_code: place.country_code,
            });
            setAddOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AddPlaceDialog({
  open,
  initialName,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onAdded: (place: PlaceOption) => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [country, setCountry] = React.useState("");
  const [admin1, setAdmin1] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [countries, setCountries] = React.useState<
    { code: string; name: string }[]
  >([]);

  React.useEffect(() => {
    let active = true;
    listCountryOptions().then((c) => {
      if (active) setCountries(c);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await requestNewPlace({
      name,
      countryCode: country,
      admin1: admin1 || null,
    });
    setBusy(false);
    if (res.error || !res.place) {
      setError(res.error ?? "Couldn't add that place.");
      return;
    }
    onAdded(res.place);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a place</DialogTitle>
          <DialogDescription>
            Only do this when the place genuinely isn’t in the list — a small
            village, or a name that has since changed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-place-name">Place name</Label>
            <Input
              id="add-place-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-place-country">Country</Label>
            <Select
              value={country || undefined}
              onValueChange={(v) => setCountry(v ?? "")}
            >
              <SelectTrigger id="add-place-country" className="w-full">
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-place-admin1">
              State / province code (optional)
            </Label>
            <Input
              id="add-place-admin1"
              value={admin1}
              onChange={(e) => setAdmin1(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Cancel
              </Button>
            }
          />
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Adding…" : "Add place"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
