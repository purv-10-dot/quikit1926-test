"use client";

import {
  ChevronDown,
  FolderPlus,
  HardDrive,
  Link2,
  Loader2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";

interface Props {
  disabled?: boolean;
  busy?: boolean;
  /** Device upload in progress — shows spinner on the Upload button */
  uploading?: boolean;
  canUpload?: boolean;
  canAttach?: boolean;
  canCreateFolder?: boolean;
  onUploadDevice: () => void;
  onAttachGlobal: () => void;
  onCreateFolder: () => void;
}

export function UploadMenu({
  disabled,
  busy,
  uploading = false,
  canUpload = true,
  canAttach = true,
  canCreateFolder = true,
  onUploadDevice,
  onAttachGlobal,
  onCreateFolder,
}: Props) {
  return (
    <>
      <Dropdown
        align="right"
        trigger={
          <Button
            type="button"
            disabled={disabled || busy || uploading}
            className="min-w-[7.5rem] gap-1 pr-2"
            aria-busy={uploading}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload
                <ChevronDown size={14} className="opacity-80" />
              </>
            )}
          </Button>
        }
      >
        <div className="py-1">
          <DropdownItem
            disabled={!canUpload}
            onSelect={() => {
              if (canUpload) onUploadDevice();
            }}
          >
            <span className="flex items-center gap-2">
              <HardDrive size={15} className="text-accent-600" />
              Upload from Device
            </span>
          </DropdownItem>
          <DropdownItem
            disabled={!canAttach}
            onSelect={() => {
              if (canAttach) onAttachGlobal();
            }}
          >
            <span className="flex items-center gap-2">
              <Link2 size={15} className="text-accent-600" />
              Upload from QuikCRM Global Files
            </span>
          </DropdownItem>
          {canCreateFolder && (
            <>
              <div className="my-1 border-t border-crm-border" />
              <DropdownItem onSelect={onCreateFolder}>
                <span className="flex items-center gap-2">
                  <FolderPlus size={15} className="text-accent-600" />
                  New Folder
                </span>
              </DropdownItem>
            </>
          )}
        </div>
      </Dropdown>
    </>
  );
}
