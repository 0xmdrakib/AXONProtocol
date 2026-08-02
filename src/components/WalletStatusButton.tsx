import { LoaderCircle, Power, Wallet } from "lucide-react";

export type WalletStatusButtonProps = {
  walletConnected: boolean;
  addressLabel?: string;
  onArc: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onOpen: () => void;
  onDisconnect: () => void;
};

export function WalletStatusButton({
  walletConnected,
  addressLabel,
  onArc,
  isConnecting,
  isDisconnecting,
  onOpen,
  onDisconnect,
}: WalletStatusButtonProps) {
  const state = !walletConnected ? "disconnected" : onArc ? "connected" : "wrongNetwork";
  const label = !walletConnected ? "Connect Wallet" : onArc ? addressLabel || "Connected wallet" : "Switch to Arc";
  const stateDescription = !walletConnected ? "Wallet disconnected" : onArc ? "Wallet connected" : "Wallet connected on another network";

  return (
    <div className={`walletStatusGroup ${state}`} aria-live="polite">
      <button className="walletStatusButton" type="button" onClick={onOpen} disabled={isConnecting}>
        <span className="walletStatusDot" aria-hidden="true" />
        <span className="walletStatusLabel">
          <span>{isConnecting ? "Connecting..." : label}</span>
          <small>{isConnecting ? "Confirm in your wallet" : stateDescription}</small>
        </span>
        {!walletConnected && <Wallet size={16} aria-hidden="true" />}
        {isConnecting && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
      </button>

      {walletConnected && (
        <button
          className="walletDisconnectButton"
          type="button"
          onClick={() => onDisconnect()}
          disabled={isDisconnecting}
          aria-label="Disconnect wallet"
          title="Disconnect wallet"
        >
          {isDisconnecting ? <LoaderCircle className="spin" size={16} /> : <Power size={17} />}
        </button>
      )}
    </div>
  );
}
