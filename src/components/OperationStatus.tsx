import "./OperationStatus.css";

/** Presentation only: the caller supplies a localized message and real worker state. */
export function OperationStatus({busy, message, error=false}: {
  busy:boolean; message:string; error?:boolean;
}) {
  return <div className={`operation-status${error?" operation-status--error":""}`}>
    <p role="status" aria-live="polite">{message}</p>
    {busy&&!error&&<div className="operation-status__progress" role="progressbar" aria-label={message}><span/></div>}
  </div>;
}
