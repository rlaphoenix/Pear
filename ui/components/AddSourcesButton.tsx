import { FileVideo } from "lucide-react";
import { Button } from "@/components/primitives/button";

interface Props {
  onClick: () => void;
  className?: string;
}

export function AddSourcesButton({ onClick, className }: Props) {
  return (
    <Button onClick={onClick} title="Add one or more sources" className={className}>
      <FileVideo className="size-4" />
      Add Sources
    </Button>
  );
}
