import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  FolderIcon,
  FileIcon,
  UploadIcon,
  DownloadIcon,
  ServerIcon,
  CheckCircleIcon,
  XCircleIcon,
  RefreshCwIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

function App() {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">TunnelFiles</h1>
            <p className="text-sm text-muted-foreground">SSH/SFTP File Manager - Theme Preview</p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleTheme}>
            {isDark ? "☀️ Light" : "🌙 Dark"}
          </Button>
        </div>

        <Separator />

        {/* Color Palette */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Color Palette</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ColorSwatch name="Primary" className="bg-primary" />
            <ColorSwatch name="Secondary" className="bg-secondary" />
            <ColorSwatch name="Accent" className="bg-accent" />
            <ColorSwatch name="Muted" className="bg-muted" />
            <ColorSwatch name="Success" className="bg-success" />
            <ColorSwatch name="Warning" className="bg-warning" />
            <ColorSwatch name="Destructive" className="bg-destructive" />
            <ColorSwatch name="Card" className="bg-card border" />
          </div>
        </section>

        <Separator />

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">
              <RefreshCwIcon className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <Separator />

        {/* Inputs */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Inputs</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input placeholder="Hostname..." />
            <Input placeholder="Username..." />
            <Input type="password" placeholder="Password..." />
            <Input disabled placeholder="Disabled input" />
          </div>
        </section>

        <Separator />

        {/* Connection Cards */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Connection Cards</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ServerIcon className="h-4 w-4 text-primary" />
                    Production Server
                  </CardTitle>
                  <Badge variant="outline" className="text-success border-success">
                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                </div>
                <CardDescription>192.168.1.100:22</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1">
                    Disconnect
                  </Button>
                  <Button size="sm" className="flex-1">
                    Browse Files
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ServerIcon className="h-4 w-4 text-muted-foreground" />
                    Staging Server
                  </CardTitle>
                  <Badge variant="outline" className="text-muted-foreground">
                    <XCircleIcon className="h-3 w-3 mr-1" />
                    Offline
                  </Badge>
                </div>
                <CardDescription>staging.example.com:22</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    Edit
                  </Button>
                  <Button size="sm" className="flex-1">
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* File List Preview */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">File List</h2>
          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                <FileRow
                  icon={<FolderIcon className="h-5 w-5 text-file-folder" />}
                  name="Documents"
                  size="—"
                  date="Jan 10, 2026"
                />
                <FileRow
                  icon={<FolderIcon className="h-5 w-5 text-file-folder" />}
                  name="Projects"
                  size="—"
                  date="Jan 8, 2026"
                  selected
                />
                <FileRow
                  icon={<FileIcon className="h-5 w-5 text-file-document" />}
                  name="config.json"
                  size="2.4 KB"
                  date="Jan 5, 2026"
                />
                <FileRow
                  icon={<FileIcon className="h-5 w-5 text-file-code" />}
                  name="deploy.sh"
                  size="1.2 KB"
                  date="Jan 3, 2026"
                />
                <FileRow
                  icon={<FileIcon className="h-5 w-5 text-file-image" />}
                  name="screenshot.png"
                  size="458 KB"
                  date="Dec 28, 2025"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Transfer Queue */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Transfer Queue</h2>
          <Card className="shadow-card">
            <CardContent className="p-4 space-y-4">
              <TransferItem
                icon={<UploadIcon className="h-4 w-4 text-transfer-upload" />}
                name="backup.tar.gz"
                status="Uploading..."
                progress={67}
              />
              <TransferItem
                icon={<DownloadIcon className="h-4 w-4 text-transfer-download" />}
                name="database.sql"
                status="Downloading..."
                progress={34}
              />
              <TransferItem
                icon={<UploadIcon className="h-4 w-4 text-transfer-pending" />}
                name="assets.zip"
                status="Waiting..."
                progress={0}
                pending
              />
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <div className="pt-8 text-center text-sm text-muted-foreground">
          Theme: macOS Finder Inspired • shadcn/ui + TailwindCSS 4
        </div>
      </div>
    </main>
  );
}

function ColorSwatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className={cn("h-12 rounded-lg", className)} />
      <p className="text-xs text-muted-foreground">{name}</p>
    </div>
  );
}

function FileRow({
  icon,
  name,
  size,
  date,
  selected,
}: {
  icon: React.ReactNode;
  name: string;
  size: string;
  date: string;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors duration-100",
        selected && "file-selected-active"
      )}
    >
      {icon}
      <span className="flex-1 text-sm font-medium">{name}</span>
      <span className="text-sm text-muted-foreground w-20 text-right">{size}</span>
      <span className="text-sm text-muted-foreground w-28 text-right">{date}</span>
    </div>
  );
}

function TransferItem({
  icon,
  name,
  status,
  progress,
  pending,
}: {
  icon: React.ReactNode;
  name: string;
  status: string;
  progress: number;
  pending?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {icon}
        <span className="flex-1 text-sm font-medium">{name}</span>
        <span className={cn("text-xs", pending ? "text-muted-foreground" : "text-foreground")}>
          {status}
        </span>
        {!pending && <span className="text-xs font-medium">{progress}%</span>}
      </div>
      <Progress value={progress} className={cn("h-1.5", pending && "opacity-40")} />
    </div>
  );
}

export default App;
