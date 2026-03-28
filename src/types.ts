/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Scene {
  id: string;
  num: string;
  story: string;
  imgPrompt: string;
  vidPrompt: string;
  imgUrl: string;
  vidUrl: string;
  imgPreviewUrl: string;
  vidPreviewUrl: string;
  notes: string;
  imgFile: File | null;
  vidFile: File | null;
  imgDuration?: number;
  vidDuration?: number;
}

export interface ProjectData {
  name: string;
  savedAt: string;
  scenes: Omit<Scene, 'imgFile' | 'vidFile'>[];
}
