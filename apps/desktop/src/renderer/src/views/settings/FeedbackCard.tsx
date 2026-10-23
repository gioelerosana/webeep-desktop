import { Button, Card, CardHeader } from '@webeep/ui-kit';
import { Bug, Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FeedbackKind } from '../../../../shared/ipc';
import { isWebRenderer } from '../../lib/http-bridge';
import { useFeedback } from './useFeedback';

type FeedbackAction = {
  readonly kind: FeedbackKind;
  readonly label: string;
  readonly icon: ReactNode;
};

const FEEDBACK_ACTIONS: readonly FeedbackAction[] = [
  { kind: 'bug', label: 'segnala un problema', icon: <Bug /> },
  { kind: 'feature', label: 'proponi una funzione', icon: <Lightbulb /> },
];

export const FeedbackCard = (): ReactNode => {
  const feedback = useFeedback();
  // Nel browser il canale non esiste: il modulo si apre dal desktop, non dalla pagina servita in rete.
  const isWeb = isWebRenderer();

  const renderBody = (): ReactNode => {
    if (isWeb) return <p className="text-sm text-muted-foreground">Le segnalazioni si inviano dall'app desktop.</p>;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {FEEDBACK_ACTIONS.map((action) => (
          <Button
            key={action.kind}
            variant="outline"
            size="sm"
            icon={action.icon}
            loading={feedback.pendingKind === action.kind}
            disabled={feedback.pendingKind !== null}
            onClick={() => feedback.open(action.kind)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Segnalazioni"
        description="Apre un modulo su GitHub con versione e sistema già compilati. Non includere dati personali."
      />
      <div className="flex flex-col gap-3 px-4 py-3">
        {renderBody()}
        {feedback.failed ? <p className="text-2xs text-error-foreground">impossibile aprire il browser</p> : null}
      </div>
    </Card>
  );
};
