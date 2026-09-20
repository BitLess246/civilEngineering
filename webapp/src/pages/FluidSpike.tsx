// SPIKE ONLY — Fluid UI evaluation route. Not for merge.
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, FluidProvider, ModalContent, ModalFooter, ModalRoot } from '@infinityfx/fluid';
import '../../fluid.css';

export default function FluidSpike() {
  const [open, setOpen] = useState(false);
  return (
    <FluidProvider as="div">
      <main style={{ padding: 32, display: 'grid', gap: 16, maxWidth: 640 }}>
        <h1>Fluid UI spike (Button + Card + Modal)</h1>
        <Card>
          <CardHeader>Spike card</CardHeader>
          <CardContent>Renders inside a scoped FluidProvider div.</CardContent>
        </Card>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => setOpen(true)}>Open modal</Button>
          <Button variant="neutral">Neutral</Button>
          <Button variant="minimal">Minimal</Button>
        </div>
        <ModalRoot show={open} onClose={() => setOpen(false)}>
          <ModalContent title="Spike modal">
            <p>Fluid modal content.</p>
          </ModalContent>
          <ModalFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </ModalFooter>
        </ModalRoot>
      </main>
    </FluidProvider>
  );
}
