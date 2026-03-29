"use client";

import * as React from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface ResponsiveDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Renders as a centered Dialog on desktop (>=768px) and a
 * bottom Drawer with drag-to-dismiss on mobile (<768px).
 */
function ResponsiveDialog({ children, open, onOpenChange }: ResponsiveDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {children}
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {children}
    </Drawer>
  );
}

/**
 * Renders DialogTrigger on desktop, DrawerTrigger on mobile.
 */
function ResponsiveDialogTrigger({ children, ...props }: React.ComponentPropsWithoutRef<typeof DialogTrigger>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogTrigger {...props}>{children}</DialogTrigger>
  ) : (
    <DrawerTrigger {...props}>{children}</DrawerTrigger>
  );
}

/**
 * Renders DialogContent on desktop, DrawerContent on mobile.
 */
function ResponsiveDialogContent({ children, className, ...props }: React.ComponentPropsWithoutRef<typeof DialogContent>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogContent className={className} {...props}>{children}</DialogContent>
  ) : (
    <DrawerContent className={className}>{children}</DrawerContent>
  );
}

function ResponsiveDialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogHeader className={className} {...props}>{children}</DialogHeader>
  ) : (
    <DrawerHeader className={className} {...props}>{children}</DrawerHeader>
  );
}

function ResponsiveDialogTitle({ children, className, ...props }: React.ComponentPropsWithoutRef<typeof DialogTitle>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogTitle className={className} {...props}>{children}</DialogTitle>
  ) : (
    <DrawerTitle className={className} {...props}>{children}</DrawerTitle>
  );
}

function ResponsiveDialogDescription({ children, className, ...props }: React.ComponentPropsWithoutRef<typeof DialogDescription>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogDescription className={className} {...props}>{children}</DialogDescription>
  ) : (
    <DrawerDescription className={className} {...props}>{children}</DrawerDescription>
  );
}

function ResponsiveDialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogFooter className={className} {...props}>{children}</DialogFooter>
  ) : (
    <DrawerFooter className={className} {...props}>{children}</DrawerFooter>
  );
}

function ResponsiveDialogClose({ children, ...props }: React.ComponentPropsWithoutRef<typeof DialogClose>) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  return isDesktop ? (
    <DialogClose {...props}>{children}</DialogClose>
  ) : (
    <DrawerClose {...props}>{children}</DrawerClose>
  );
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogClose,
};
