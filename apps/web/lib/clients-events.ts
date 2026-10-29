/** Tells the portal shell to refetch the client list after a create, rename or archive. */
export const CLIENTS_CHANGED = "ownlevel:clients-changed";
export const notifyClientsChanged = () => window.dispatchEvent(new Event(CLIENTS_CHANGED));
