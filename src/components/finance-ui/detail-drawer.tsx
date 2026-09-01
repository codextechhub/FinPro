// <DetailDrawer> - a right-side drawer over the app's Sheet primitive, used for
// record details (view a journal, an invoice, a PO…) and read-only inspection
// without leaving the list. Actions for the record live in `footer`.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Width of the drawer; defaults to a comfortable record width. */
  widthClass?: string;
  /**
   * Which typeface the drawer adopts. The Sheet portals to <body>, outside the
   * page it belongs to, so it cannot inherit - it has to be told.
   * "geist" (default) matches the Finance and Procurement consoles; "app" is
   * for the rest of the app, which is Montserrat. Getting this wrong is
   * invisible until you notice the drawer's font disagrees with the page.
   */
  typeface?: "geist" | "app";
}

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  widthClass = "sm:max-w-xl",
  typeface = "geist",
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          typeface === "geist" && "console-geist",
          widthClass,
        )}
      >
        <SheetHeader className="border-b border-white-02 px-5 py-4">
          <SheetTitle className="font-mont text-base font-semibold text-black-01">{title}</SheetTitle>
          <SheetDescription className={cn("font-mont text-xs text-gray-05", !description && "sr-only")}>
            {description ?? "Review the selected record and its available actions."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4">{children}</div>
        </ScrollArea>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white-02 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
