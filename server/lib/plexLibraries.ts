import type { Library } from '@server/lib/settings';

export interface LibraryRemap {
  from: Library;
  to: Library;
  // How the new library was found
  match: 'name' | 'similar';
}

export interface LibraryReconcileResult {
  libraries: Library[];
  // Enabled libraries whose id changed
  remapped: LibraryRemap[];
  // Enabled libraries no longer found in Plex, or with no clear match
  broken: Library[];
}

// Similar names must share at least half their words, and beat the next
// closest name clearly, before a library is moved over on its own.
const MIN_SIMILARITY = 0.5;
const MIN_MARGIN = 0.2;

const normalize = (name: string) => (name ?? '').trim().toLowerCase();

// Libraries saved before types were recorded match any type
const sameType = (library: Library, candidate: Pick<Library, 'type'>) =>
  !library.type || library.type === candidate.type;

const words = (name: string) =>
  normalize(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// Dice coefficient over the words of both names
export const nameSimilarity = (a: string, b: string): number => {
  const wordsA = new Set(words(a));
  const wordsB = new Set(words(b));

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  const shared = [...wordsA].filter((word) => wordsB.has(word)).length;

  return (2 * shared) / (wordsA.size + wordsB.size);
};

/**
 * Matches saved libraries to the libraries Plex lists now. Plex renumbers
 * section ids when its database is restored or a library is recreated, so
 * the id alone cannot be trusted:
 *
 * 1. A library with the same name and type is the same library.
 * 2. Otherwise the same id with the same type is (the library was renamed).
 * 3. Otherwise an enabled library moves to the same type with the closest
 *    name, only when that match is clear ("UFC PPV Events" to "UFC Events").
 *
 * Enabled libraries left without a match are returned as broken. With
 * keepBroken they stay in the list, still enabled, so the problem keeps
 * being reported until an admin picks the library again.
 */
export const reconcileLibraries = (
  saved: Library[],
  fresh: Pick<Library, 'id' | 'name' | 'type'>[],
  { keepBroken = false }: { keepBroken?: boolean } = {}
): LibraryReconcileResult => {
  const matches = new Map<
    Library,
    { target: string; match: 'id' | LibraryRemap['match'] }
  >();
  const claimed = new Set<string>();

  const claim = (
    library: Library,
    target: string,
    match: 'id' | LibraryRemap['match']
  ) => {
    matches.set(library, { target, match });
    claimed.add(target);
  };

  // Enabled libraries choose first, so they win any contest
  const ordered = [...saved].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled)
  );

  // 1. Same name and type, when exactly one library has that name
  for (const library of ordered) {
    const sameName = fresh.filter(
      (candidate) =>
        sameType(library, candidate) &&
        normalize(candidate.name) === normalize(library.name) &&
        !claimed.has(candidate.id)
    );

    if (sameName.length === 1) {
      claim(
        library,
        sameName[0].id,
        sameName[0].id === library.id ? 'id' : 'name'
      );
    }
  }

  // 2. Same id and type
  for (const library of ordered) {
    if (matches.has(library)) {
      continue;
    }

    const sameId = fresh.find(
      (candidate) =>
        candidate.id === library.id &&
        sameType(library, candidate) &&
        !claimed.has(candidate.id)
    );

    if (sameId) {
      claim(library, sameId.id, 'id');
    }
  }

  // 3. Closest name of the same type, enabled libraries only
  for (const library of ordered) {
    if (matches.has(library) || !library.enabled) {
      continue;
    }

    const scored = fresh
      .filter(
        (candidate) =>
          sameType(library, candidate) && !claimed.has(candidate.id)
      )
      .map((candidate) => ({
        candidate,
        score: nameSimilarity(library.name, candidate.name),
      }))
      .sort((a, b) => b.score - a.score);

    const [best, runnerUp] = scored;

    if (
      best &&
      best.score >= MIN_SIMILARITY &&
      (!runnerUp || best.score - runnerUp.score >= MIN_MARGIN)
    ) {
      claim(library, best.candidate.id, 'similar');
    }
  }

  const remapped: LibraryRemap[] = [];
  const libraries: Library[] = fresh.map((candidate) => {
    const source = saved.find(
      (library) => matches.get(library)?.target === candidate.id
    );
    const library: Library = {
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
      enabled: source?.enabled ?? false,
      lastScan: source?.lastScan,
    };

    const match = source ? matches.get(source) : undefined;

    if (source?.enabled && match && match.match !== 'id') {
      remapped.push({ from: source, to: library, match: match.match });
    }

    return library;
  });

  const broken = saved.filter(
    (library) => library.enabled && !matches.has(library)
  );

  if (keepBroken) {
    broken.forEach((library) => {
      // Two libraries cannot share an id. When Plex reused it, the broken
      // entry gives way.
      if (!libraries.some((other) => other.id === library.id)) {
        libraries.push({ ...library });
      }
    });
  }

  return { libraries, remapped, broken };
};
