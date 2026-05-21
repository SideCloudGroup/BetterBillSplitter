interface CapSolveEvent extends CustomEvent {
  detail: { token: string };
}

interface CapWidgetElement extends HTMLElement {
  reset?: () => void;
}

declare global {
  interface HTMLElementTagNameMap {
    'cap-widget': CapWidgetElement;
  }
}

export type {CapSolveEvent, CapWidgetElement};
