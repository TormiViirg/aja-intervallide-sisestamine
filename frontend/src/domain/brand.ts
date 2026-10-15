/** Nominal typing helper: a `string` that is a DateKey can't be passed where a UtcIso is expected. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type FestivalId = Brand<string, 'FestivalId'>;
export type TeamId = Brand<string, 'TeamId'>;
export type LocationId = Brand<string, 'LocationId'>;
export type VolunteerId = Brand<string, 'VolunteerId'>;
