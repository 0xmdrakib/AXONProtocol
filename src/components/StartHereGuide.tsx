import { ArrowRight, CheckCircle2, ListChecks, type LucideIcon } from "lucide-react";

export type StartHereStepState = "complete" | "current" | "upcoming";

export type StartHereStep = {
  number: string;
  title: string;
  description: string;
  status: string;
  actionLabel: string;
  state: StartHereStepState;
  Icon: LucideIcon;
  onAction: () => void;
  disabled?: boolean;
};

type StartHereGuideProps = {
  completedCount: number;
  steps: readonly StartHereStep[];
};

export function StartHereGuide({ completedCount, steps }: StartHereGuideProps) {
  return (
    <section className="panel wide startGuide" aria-labelledby="start-guide-title">
      <div className="startGuideHeader">
        <div className="startGuideHeading">
          <div className="panelTitle">
            <ListChecks size={19} />
            <h3 id="start-guide-title">Start here</h3>
          </div>
          <span className="startGuideProgress">
            {completedCount} of {steps.length} ready
          </span>
        </div>
        <p>
          Follow the launch path from your owner wallet to the first policy-controlled payment. Each action opens the exact workspace for the next step.
        </p>
      </div>

      <div className="startGuideSteps">
        {steps.map((step) => {
          const Icon = step.Icon;

          return (
            <article className={`startGuideStep ${step.state}`} key={step.number}>
              <div className="startGuideStepHeader">
                <span className="startGuideNumber">{step.number}</span>
                <span className="startGuideIcon">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className={`startGuideStepState ${step.state}`}>
                  {step.state === "complete" && <CheckCircle2 size={13} aria-hidden="true" />}
                  {step.status}
                </span>
              </div>

              <div className="startGuideStepContent">
                <h4>{step.title}</h4>
                <p>{step.description}</p>
              </div>

              <button
                className={step.state === "current" ? undefined : "secondaryButton"}
                type="button"
                disabled={step.disabled}
                onClick={step.onAction}
              >
                {step.actionLabel}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </article>
          );
        })}
      </div>

      <div className="startGuideFootnote">
        <span className="startGuideFootnoteMark" aria-hidden="true">
          →
        </span>
        <span>
          Recommended order: <strong>Connect</strong> → <strong>Deploy</strong> → <strong>Vault</strong> → <strong>Services</strong> → <strong>Audit</strong>.
        </span>
      </div>
    </section>
  );
}
