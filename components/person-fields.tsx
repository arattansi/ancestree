"use client";

import * as React from "react";
import {
  useFormContext,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

import { PlaceAutocomplete } from "@/components/place-autocomplete";
import { countryName } from "@/lib/country-names";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LINEAGE_TYPES } from "@/lib/person-schema";

/**
 * The shared demographic fieldset for a single person. Works standalone
 * (`prefix` omitted) or as one row of a `people[]` field array (`prefix`
 * e.g. `"people.2"`).
 */
export function PersonFields<T extends FieldValues>({
  control,
  isAdmin,
  prefix,
  idPrefix,
  placeLabels,
}: {
  control: Control<T>;
  isAdmin: boolean;
  prefix?: string;
  idPrefix: string;
  /** Labels for already-selected places, so the edit form shows them on load. */
  placeLabels?: { birth?: string | null; death?: string | null };
}) {
  const { setValue } = useFormContext<T>();
  const name = React.useCallback(
    (field: string) => (prefix ? `${prefix}.${field}` : field) as Path<T>,
    [prefix],
  );

  const isDeceased = useWatch({ control, name: name("is_deceased") });
  const placeIdBirth = useWatch({ control, name: name("place_id_birth") });
  const placeIdDeath = useWatch({ control, name: name("place_id_death") });

  const setPlace = React.useCallback(
    (
      kind: "birth" | "death",
      place: { id: number; name: string; country_code: string | null } | null,
    ) => {
      const label = place
        ? [place.name, countryName(place.country_code)].filter(Boolean).join(", ")
        : "";
      const idField = kind === "birth" ? "place_id_birth" : "place_id_death";
      const textField = kind === "birth" ? "city_of_birth" : "place_of_death";
      setValue(name(idField), (place?.id ?? null) as never, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(
        name(textField),
        (kind === "birth" ? place?.name ?? "" : label) as never,
        { shouldDirty: true },
      );
      if (kind === "birth") {
        setValue(
          name("country_of_birth"),
          (place
            ? countryName(place.country_code) || place.country_code || ""
            : "") as never,
          { shouldValidate: true, shouldDirty: true },
        );
      }
    },
    [name, setValue],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={name("first_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>First name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="given-name"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Enter a first name or a preferred name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name("middle_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Middle name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="additional-name"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={name("preferred_name")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="nickname"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={name("last_name")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Last name</FormLabel>
            <FormControl>
              <Input
                autoComplete="family-name"
                required
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={name("maiden_name")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Maiden name</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ""} />
            </FormControl>
            <FormDescription>
              Optional. A last name at birth, before any change on marriage.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={name("date_of_birth")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date of birth</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={name("place_id_birth")}
        render={({ fieldState }) => (
          <FormItem>
            <FormLabel htmlFor={`${idPrefix}-place-birth`}>
              Place of birth
            </FormLabel>
            <FormControl>
              <PlaceAutocomplete
                id={`${idPrefix}-place-birth`}
                value={typeof placeIdBirth === "number" ? placeIdBirth : null}
                initialLabel={placeLabels?.birth}
                isAdmin={isAdmin}
                invalid={Boolean(fieldState.error)}
                placeholder="Search for a city, town, or village…"
                onChange={(place) => setPlace("birth", place)}
              />
            </FormControl>
            <FormDescription>
              Pick the closest match — you can’t enter a place that isn’t listed.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={name("is_deceased")}
        render={({ field }) => (
          <FormItem className="flex-row items-center gap-3">
            <FormControl>
              <Checkbox
                id={`${idPrefix}-is-deceased`}
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            </FormControl>
            <FormLabel
              htmlFor={`${idPrefix}-is-deceased`}
              className="font-normal"
            >
              This person is deceased
            </FormLabel>
          </FormItem>
        )}
      />

      {isDeceased ? (
        <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          <FormField
            control={control}
            name={name("date_of_death")}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of death</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={name("place_id_death")}
            render={() => (
              <FormItem>
                <FormLabel htmlFor={`${idPrefix}-place-death`}>
                  Place of death
                </FormLabel>
                <FormControl>
                  <PlaceAutocomplete
                    id={`${idPrefix}-place-death`}
                    value={
                      typeof placeIdDeath === "number" ? placeIdDeath : null
                    }
                    initialLabel={placeLabels?.death}
                    isAdmin={isAdmin}
                    placeholder="Search for a place…"
                    onChange={(place) => setPlace("death", place)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      ) : null}

      {isAdmin ? (
        <FormField
          control={control}
          name={name("lineage_type")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lineage</FormLabel>
              <Select
                value={field.value ?? undefined}
                onValueChange={(v) => field.onChange(v || undefined)}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LINEAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Admin only. How this person connects to their parent.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}
