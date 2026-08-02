import { LoaderCircle, Wallet, X } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import type { Connector } from "wagmi";

export type WalletPickerModalProps = {
  open: boolean;
  connectors: readonly Connector[];
  isConnecting: boolean;
  walletConnectReady: boolean;
  walletConnectMissing: boolean;
  error?: string;
  onConnect: (connector: Connector) => void;
  onClose: () => void;
};

export function isWalletConnectConnector(connector: Connector) {
  return connector.type === "walletConnect" || connector.id.toLowerCase().includes("walletconnect");
}

function connectorLabel(connector: Connector) {
  if (isWalletConnectConnector(connector)) return "WalletConnect";
  return connector.name || connector.id;
}

function connectorIconUrl(connector: Connector) {
  return connector.icon || "";
}

function WalletConnectMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="#1c1c1c" />
      <path
        d="M19.6 26.2C26.5 19.5 37.5 19.5 44.4 26.2L46 27.8C46.7 28.5 46.7 29.6 46 30.2L40.5 35.5C40.1 35.9 39.4 35.9 39 35.5L36.8 33.4C34.2 30.9 29.9 30.9 27.2 33.4L24.9 35.6C24.5 36 23.9 36 23.5 35.6L18 30.2C17.3 29.6 17.3 28.5 18 27.8L19.6 26.2Z"
        fill="#ffffff"
      />
      <path
        d="M28.6 37.2C30.5 35.3 33.5 35.3 35.4 37.2L37.1 38.8C37.6 39.3 37.6 40.1 37.1 40.6L33.1 44.5C32.5 45.1 31.5 45.1 30.9 44.5L26.9 40.6C26.4 40.1 26.4 39.3 26.9 38.8L28.6 37.2Z"
        fill="#ffffff"
      />
    </svg>
  );
}

function ConnectorIcon({ connector }: { connector: Connector }) {
  const icon = connectorIconUrl(connector);

  if (isWalletConnectConnector(connector)) {
    return <WalletConnectMark />;
  }

  if (icon) {
    return <img src={icon} alt="" />;
  }

  return <Wallet size={20} />;
}

export function WalletPickerModal({
  open,
  connectors,
  isConnecting,
  walletConnectReady,
  walletConnectMissing,
  error,
  onConnect,
  onClose,
}: WalletPickerModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const browserConnectors = connectors.filter(
    (connector) => !isWalletConnectConnector(connector) && !(connector.type === "injected" && connector.name === "Injected"),
  );
  const walletConnectConnector = connectors.find(isWalletConnectConnector);

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="walletModalOverlay" onMouseDown={handleBackdropMouseDown}>
      <section
        ref={dialogRef}
        className="walletModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-modal-title"
        aria-describedby="wallet-modal-description"
      >
        <header className="walletModalHeader">
          <div>
            <span className="eyebrow">Wallet connection</span>
            <h2 id="wallet-modal-title">Choose wallet</h2>
            <p id="wallet-modal-description">Select an installed browser wallet to connect.</p>
          </div>
          <button ref={closeButtonRef} className="modalCloseButton" type="button" onClick={onClose} aria-label="Close wallet picker">
            <X size={19} />
          </button>
        </header>

        {error && (
          <div className="modalError" role="alert">
            {error}
          </div>
        )}

        <div className="walletChoiceList" aria-label="Browser wallets">
          {browserConnectors.length > 0 ? (
            browserConnectors.map((connector) => (
              <button
                className="walletChoice"
                key={connector.uid}
                type="button"
                disabled={isConnecting}
                onClick={() => onConnect(connector)}
              >
                <span className="walletChoiceIcon" aria-hidden="true">
                  <ConnectorIcon connector={connector} />
                </span>
                <span className="walletChoiceCopy">
                  <strong>{connectorLabel(connector)}</strong>
                  <small>Browser extension</small>
                </span>
                {isConnecting && <LoaderCircle className="spin" size={18} aria-label="Connecting" />}
              </button>
            ))
          ) : (
            <div className="walletEmptyState">
              <Wallet size={20} />
              <div>
                <strong>No browser wallets detected</strong>
                <span>Install a supported wallet extension, then refresh this page.</span>
              </div>
            </div>
          )}
        </div>

        <div className="walletConnectSection">
          {walletConnectReady && walletConnectConnector ? (
            <button
              className="walletChoice walletConnectChoice"
              type="button"
              disabled={isConnecting}
              onClick={() => onConnect(walletConnectConnector)}
            >
              <span className="walletChoiceIcon walletConnectIcon" aria-hidden="true">
                <ConnectorIcon connector={walletConnectConnector} />
              </span>
              <span className="walletChoiceCopy">
                <strong>WalletConnect</strong>
                <small>Scan with a mobile wallet</small>
              </span>
              {isConnecting && <LoaderCircle className="spin" size={18} aria-label="Connecting" />}
            </button>
          ) : walletConnectMissing ? (
            <div className="walletConnectUnavailable">
              <span className="walletChoiceIcon walletConnectIcon" aria-hidden="true">
                <Wallet size={20} />
              </span>
              <div>
                <strong>WalletConnect unavailable</strong>
                <span>Add `VITE_WALLETCONNECT_PROJECT_ID` to enable mobile wallets.</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="walletModalFooter">
          <button className="modalCancelButton" type="button" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}
