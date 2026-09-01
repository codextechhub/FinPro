// The package's public surface.
//
// Consumers reach the screens and services through subpath imports, which the
// "./*" export permits; this file names the things every host needs regardless
// of which screens it mounts. It exists because package.json points main and
// types here, and pointed at nothing until now: an installed copy could not
// resolve its own entry.

// The contract each application implements. Import the TYPES from here rather
// than re-declaring them, or the compile-time assertion checks a copy.
export type {
  HostBranch,
  HostPerson,
  HostQueryResult,
  HostExportProps,
  HostContract,
} from "./host";

// The shared UI the screens are built from.
export * from "./components/finance-ui";
