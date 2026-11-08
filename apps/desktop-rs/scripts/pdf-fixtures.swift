// Development-only Quartz fixtures; the native viewer never executes this script.
import Foundation
import CoreGraphics
let output = CommandLine.arguments[1]
let directory = URL(fileURLWithPath: output, isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for (name, pages, protected) in [("protected",2,true)] {
    var box = CGRect(x:0,y:0,width:612,height:792)
    let url = directory.appendingPathComponent("\(name).pdf")
    let options:CFDictionary? = protected ? [kCGPDFContextUserPassword as String:"fixture-password",kCGPDFContextOwnerPassword as String:"fixture-owner",kCGPDFContextEncryptionKeyLength as String:128] as CFDictionary : nil
    guard let context = CGContext(url as CFURL,mediaBox:&box,options) else { fatalError("Could not create fixture") }
    for index in 1...pages {
        context.beginPDFPage(nil)
        context.setFillColor(CGColor(gray:1,alpha:1));context.fill(box)
        context.setFillColor(CGColor(red:0.1,green:Double(index%10)/20+0.1,blue:0.4,alpha:1))
        context.fill(CGRect(x:36,y:528,width:540,height:168))
        // Draw the original selectable text fixture through its native page.
        let source = CGPDFDocument(URL(fileURLWithPath: "apps/desktop-rs/assets/probe.pdf") as CFURL)!
        context.drawPDFPage(source.page(at: index%2+1)!)
        context.endPDFPage()
    }
    context.closePDF()
    print(url.path)
}
