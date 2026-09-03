"use client";

import * as React from "react";
import { useWatch, type Control } from "react-hook-form";

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
import {
  PET_SPECIES,
  SPECIES_GLYPHS,
  SPECIES_LABELS,
  type PetFormValues,
  type PetSpecies,
} from "@/lib/pet-schema";

/**
 * Every field a companion has — which is the point. A person entry asks for
 * names, places, dates, and lineage; this asks for a name, what animal it is,
 * and roughly when. Anything more would make a pet feel like a relative.
 */
export function CompanionFields({
  control,
  idPrefix,
}: {
  control: Control<PetFormValues>;
  idPrefix: string;
}) {
  const species = useWatch({ control, name: "species" });
  const isDeceased = useWatch({ control, name: "is_deceased" });

  return (
    <div className="flex flex-col gap-4">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel htmlFor={`${idPrefix}-name`}>Name</FormLabel>
            <FormControl>
              <Input
                id={`${idPrefix}-name`}
                placeholder="Biscuit"
                autoComplete="off"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name="species"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={`${idPrefix}-species`}>Animal</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger id={`${idPrefix}-species`} className="w-full">
                    {/* Base UI renders the raw value unless it is given a
                        renderer, which would show "dog" in the closed trigger. */}
                    <SelectValue>
                      {(value: PetSpecies) =>
                        `${SPECIES_GLYPHS[value]} ${SPECIES_LABELS[value]}`
                      }
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PET_SPECIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SPECIES_GLYPHS[value]} {SPECIES_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {species === "other" ? (
          <FormField
            control={control}
            name="species_label"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor={`${idPrefix}-species-label`}>
                  What kind?
                </FormLabel>
                <FormControl>
                  <Input
                    id={`${idPrefix}-species-label`}
                    placeholder="Rabbit"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <FormField
          control={control}
          name="year_born"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={`${idPrefix}-year-born`}>Year born</FormLabel>
              <FormControl>
                <Input
                  id={`${idPrefix}-year-born`}
                  inputMode="numeric"
                  placeholder="2014"
                  maxLength={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>Optional — a year is plenty.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="is_deceased"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-2.5">
            <FormControl>
              <Checkbox
                id={`${idPrefix}-deceased`}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            </FormControl>
            <FormLabel htmlFor={`${idPrefix}-deceased`} className="font-normal">
              No longer with us
            </FormLabel>
          </FormItem>
        )}
      />

      {isDeceased ? (
        <FormField
          control={control}
          name="year_died"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={`${idPrefix}-year-died`}>Year died</FormLabel>
              <FormControl>
                <Input
                  id={`${idPrefix}-year-died`}
                  inputMode="numeric"
                  placeholder="2024"
                  maxLength={4}
                  className="max-w-32"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}
