"use client";

import { useState } from "react";

type Props = {
  /** The search term the URL currently carries. */
  value: string;
  placeholder: string;
  /** Accessible name, for a field that is not inside its own label. */
  label?: string;
  className: string;
};

/**
 * The search box of a filter bar.
 *
 * It follows the URL's term rather than only being seeded from it: Clear, a chip
 * and Back all change the filters without touching the field, and an uncontrolled
 * input would keep the old text on screen and submit it again on the next Apply.
 * The term is also the input's key, so a change from the URL remounts it at the
 * new value while typing stays local and responsive.
 */
export function FilterSearch({ value, ...rest }: Props) {
  return <SearchInput key={value} initial={value} {...rest} />;
}

function SearchInput({
  initial,
  placeholder,
  label,
  className,
}: Omit<Props, "value"> & { initial: string }) {
  const [term, setTerm] = useState(initial);

  return (
    <input
      type="search"
      name="q"
      value={term}
      onChange={(event) => setTerm(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className={className}
    />
  );
}
