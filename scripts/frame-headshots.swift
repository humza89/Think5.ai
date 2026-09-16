// Crop every headshot to one geometry relative to the detected face so the
// whole series shares an identical head-and-shoulders framing.
//
//   swift scripts/frame-headshots.swift <in-dir> <out-dir>
//
// Output: 4:5 JPEGs, face centred horizontally, eyes on the upper third.
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else {
  FileHandle.standardError.write("usage: frame-headshots.swift <in-dir> <out-dir>\n".data(using: .utf8)!)
  exit(1)
}
let inDir = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let files = (try? FileManager.default.contentsOfDirectory(at: inDir, includingPropertiesForKeys: nil))?
  .filter { $0.pathExtension.lowercased() == "jpg" }.sorted { $0.lastPathComponent < $1.lastPathComponent } ?? []

// Series geometry (multiples of the detected face width)
let cropWidthFactor: CGFloat = 2.2    // crop width = 2.2 × face width
let aspect: CGFloat = 1.25            // height / width (4:5)
let faceCenterYFraction: CGFloat = 0.43 // face centre sits 43% down the crop
let outputWidth = 720

for file in files {
  guard let image = NSImage(contentsOf: file), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("✗ \(file.lastPathComponent): cannot read"); continue
  }
  let W = CGFloat(cg.width), H = CGFloat(cg.height)
  let request = VNDetectFaceRectanglesRequest()
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  try? handler.perform([request])
  guard let face = (request.results ?? []).max(by: { $0.boundingBox.width < $1.boundingBox.width }) else {
    print("✗ \(file.lastPathComponent): no face"); continue
  }
  // Vision box is normalised with origin bottom-left; convert to pixel top-left
  let fb = face.boundingBox
  let faceW = fb.width * W
  let faceH = fb.height * H
  let faceCX = (fb.midX) * W
  let faceCY = (1 - fb.midY) * H

  var cropW = min(W, faceW * cropWidthFactor)
  var cropH = cropW * aspect
  if cropH > H { cropH = H; cropW = cropH / aspect }
  var x = faceCX - cropW / 2
  var y = faceCY - cropH * faceCenterYFraction
  x = max(0, min(W - cropW, x))
  y = max(0, min(H - cropH, y))
  let rect = CGRect(x: x, y: y, width: cropW, height: cropH).integral

  guard let cropped = cg.cropping(to: rect) else { print("✗ \(file.lastPathComponent): crop failed"); continue }
  let outH = Int(CGFloat(outputWidth) * aspect)
  guard let ctx = CGContext(data: nil, width: outputWidth, height: outH, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { continue }
  ctx.interpolationQuality = .high
  ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: outputWidth, height: outH))
  guard let out = ctx.makeImage() else { continue }
  let rep = NSBitmapImageRep(cgImage: out)
  guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.88]) else { continue }
  let dest = outDir.appendingPathComponent(file.lastPathComponent)
  try? data.write(to: dest)
  print("✓ \(file.lastPathComponent)  face \(Int(faceW))×\(Int(faceH))px  crop \(Int(rect.width))×\(Int(rect.height))")
}
