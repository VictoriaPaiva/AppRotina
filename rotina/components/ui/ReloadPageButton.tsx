'use client';
import { Button } from './button';

/** Used only on failed reads, where no editable draft has been mounted. */
export function ReloadPageButton() {
  return <Button type="button" variant="outline" onClick={() => window.location.reload()}>Tentar novamente</Button>;
}
