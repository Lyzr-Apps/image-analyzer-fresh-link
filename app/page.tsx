'use client'

import { useState, useRef, useCallback } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, X, Loader2, Copy, Check, ChevronDown, ChevronUp, AlertCircle, FileText } from 'lucide-react'
import { copyToClipboard } from '@/lib/clipboard'

const AGENT_ID = '698bd590544d8929157d0282'

const THEME_VARS = {
  '--background': '0 0% 4%',
  '--foreground': '0 0% 95%',
  '--card': '0 0% 6%',
  '--card-foreground': '0 0% 95%',
  '--popover': '0 0% 9%',
  '--popover-foreground': '0 0% 95%',
  '--primary': '0 0% 95%',
  '--primary-foreground': '0 0% 9%',
  '--secondary': '0 0% 12%',
  '--secondary-foreground': '0 0% 95%',
  '--accent': '0 0% 18%',
  '--accent-foreground': '0 0% 95%',
  '--destructive': '0 63% 31%',
  '--destructive-foreground': '0 0% 98%',
  '--muted': '0 0% 15%',
  '--muted-foreground': '0 0% 60%',
  '--border': '0 0% 15%',
  '--input': '0 0% 20%',
  '--ring': '0 0% 60%',
  '--radius': '0.125rem'
} as React.CSSProperties

interface ImageData {
  file: File
  preview: string
  base64: string
}

interface AnalysisResult {
  status: string
  result: {
    summary: string
    data: {
      scene_description: string
      objects_detected: Array<{ object: string; confidence: string }>
      text_extracted: string
      color_analysis: {
        dominant_colors: Array<{ color_name: string; hex_code: string }>
      }
      mood_and_context: {
        emotional_tone: string
        suggested_use_cases: Array<string>
      }
    }
  }
  metadata: {
    agent_name: string
    timestamp: string
  }
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-border rounded-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-accent transition-colors"
      >
        <span className="font-medium text-sm tracking-wide">{title}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-border bg-card/50">
          {children}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [copiedText, setCopiedText] = useState(false)
  const [useSampleData, setUseSampleData] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [rawResponse, setRawResponse] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sampleResult: AnalysisResult = {
    status: 'success',
    result: {
      summary: 'A serene image of a river flowing through a dense forest under a clear blue sky.',
      data: {
        scene_description: 'The image depicts a tranquil natural scene where a river winds its way through a lush, dense forest. Above, the sky is clear and vividly blue, suggesting a bright, sunny day.',
        objects_detected: [
          { object: 'river', confidence: '98%' },
          { object: 'trees', confidence: '95%' },
          { object: 'sky', confidence: '99%' }
        ],
        text_extracted: '',
        color_analysis: {
          dominant_colors: [
            { color_name: 'Sky Blue', hex_code: '#87CEEB' },
            { color_name: 'Forest Green', hex_code: '#228B22' },
            { color_name: 'Earth Brown', hex_code: '#8B4513' }
          ]
        },
        mood_and_context: {
          emotional_tone: 'calm and peaceful',
          suggested_use_cases: ['nature blog', 'environmental poster', 'relaxation app background']
        }
      }
    },
    metadata: {
      agent_name: 'Image Analyzer Agent',
      timestamp: '2026-02-11T01:05:00Z'
    }
  }

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        resolve(base64.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = async (file: File) => {
    setError(null)

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      setError('Please upload a valid image file (JPG, PNG, WEBP, or GIF)')
      return
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return
    }

    try {
      const preview = URL.createObjectURL(file)
      const base64 = await convertToBase64(file)

      setImageData({
        file,
        preview,
        base64
      })
      setAnalysisResult(null)
    } catch (err) {
      setError('Failed to process image')
    }
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleAnalyze = async () => {
    if (!imageData) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const uploadResult = await uploadFiles(imageData.file)

      if (!uploadResult.asset_ids || uploadResult.asset_ids.length === 0) {
        throw new Error('Failed to upload image')
      }

      const result = await callAIAgent(
        'Analyze this image and provide a comprehensive breakdown in JSON format with these sections: scene_description (string), objects_detected (array of {object, confidence}), text_extracted (string), color_analysis ({dominant_colors: array of {color_name, hex_code}}), and mood_and_context ({emotional_tone, suggested_use_cases array}). Return as: {status: "success", result: {summary: string, data: {...}}, metadata: {agent_name, timestamp}}',
        AGENT_ID,
        { assets: uploadResult.asset_ids }
      )

      console.log('Agent Response:', result)
      console.log('Normalized Response:', result.response)
      setRawResponse(JSON.stringify(result, null, 2))

      if (result.success) {
        const normalized = result.response

        // Try multiple paths to extract the data
        let finalResult: AnalysisResult | null = null

        // Path 1: Check if it's already in the correct format (result.data structure)
        if (normalized.result?.data) {
          finalResult = normalized as AnalysisResult
        }
        // Path 2: Check if data is at the top level of result
        else if (normalized.result) {
          const res = normalized.result

          // Check if the fields are directly in result (no nested data object)
          if (res.scene_description || res.objects_detected || res.color_analysis || res.mood_and_context) {
            finalResult = {
              status: normalized.status || 'success',
              result: {
                summary: res.summary || normalized.message || 'Image analysis completed',
                data: {
                  scene_description: res.scene_description || '',
                  objects_detected: Array.isArray(res.objects_detected) ? res.objects_detected : [],
                  text_extracted: res.text_extracted || '',
                  color_analysis: {
                    dominant_colors: res.color_analysis?.dominant_colors || []
                  },
                  mood_and_context: {
                    emotional_tone: res.mood_and_context?.emotional_tone || '',
                    suggested_use_cases: Array.isArray(res.mood_and_context?.suggested_use_cases)
                      ? res.mood_and_context.suggested_use_cases
                      : []
                  }
                }
              },
              metadata: normalized.metadata || {
                agent_name: 'Image Analyzer Agent',
                timestamp: new Date().toISOString()
              }
            }
          }
          // Path 3: Check if entire result is the data object
          else if (res.summary && res.data) {
            finalResult = {
              status: normalized.status || 'success',
              result: res,
              metadata: normalized.metadata || {
                agent_name: 'Image Analyzer Agent',
                timestamp: new Date().toISOString()
              }
            } as AnalysisResult
          }
        }

        if (finalResult) {
          console.log('Mapped Result:', finalResult)
          setAnalysisResult(finalResult)
        } else {
          // Show what we got for debugging
          console.error('Could not map response:', normalized)
          setError('Could not parse agent response. Enable debug view to see raw response.')
          setShowDebug(true)
        }
      } else {
        setError(result.error || 'Failed to analyze image')
        setShowDebug(true)
      }
    } catch (err) {
      console.error('Analysis error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred during analysis')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleClearAll = () => {
    if (imageData?.preview) {
      URL.revokeObjectURL(imageData.preview)
    }
    setImageData(null)
    setAnalysisResult(null)
    setError(null)
    setUseSampleData(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = () => {
    if (imageData?.preview) {
      URL.revokeObjectURL(imageData.preview)
    }
    setImageData(null)
    setAnalysisResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCopyText = async (text: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    }
  }

  const displayResult = useSampleData ? sampleResult : analysisResult

  return (
    <div style={THEME_VARS} className="min-h-screen bg-background text-foreground font-sans">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-wide leading-relaxed">Image Analyzer</h1>
            <p className="text-muted-foreground text-sm mt-1">Upload an image to analyze objects, text, colors, and context</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Debug View</span>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className={`relative inline-flex h-6 w-11 items-center rounded-sm transition-colors ${showDebug ? 'bg-primary' : 'bg-input'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-sm bg-background transition-transform ${showDebug ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Sample Data</span>
              <button
                onClick={() => setUseSampleData(!useSampleData)}
                className={`relative inline-flex h-6 w-11 items-center rounded-sm transition-colors ${useSampleData ? 'bg-primary' : 'bg-input'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-sm bg-background transition-transform ${useSampleData ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Upload & Preview */}
          <div className="space-y-6">
            {/* Upload Zone */}
            {!imageData && !useSampleData && (
              <Card className="border-border">
                <CardContent className="p-0">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-sm cursor-pointer transition-all ${
                      isDragging
                        ? 'border-primary bg-accent/50'
                        : 'border-border hover:border-muted-foreground hover:bg-accent/30'
                    } p-12 flex flex-col items-center justify-center min-h-[400px]`}
                  >
                    <Upload className="w-16 h-16 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2 tracking-wide">Drop your image here</p>
                    <p className="text-sm text-muted-foreground mb-1">or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-4">Supports JPG, PNG, WEBP, GIF (max 10MB)</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </CardContent>
              </Card>
            )}

            {/* Image Preview */}
            {imageData && !useSampleData && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium tracking-wide">Image Preview</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImage}
                      className="h-8 w-8 p-0 hover:bg-destructive/20"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative rounded-sm overflow-hidden border border-border">
                    <img
                      src={imageData.preview}
                      alt="Preview"
                      className="w-full h-auto max-h-[400px] object-contain bg-secondary"
                    />
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Filename:</span>
                      <span className="font-medium">{imageData.file.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span className="font-medium">{(imageData.file.size / 1024).toFixed(2)} KB</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sample Data Display */}
            {useSampleData && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium tracking-wide">Sample Image</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-to-br from-blue-500/20 via-green-500/20 to-amber-700/20 rounded-sm h-[300px] flex items-center justify-center border border-border">
                    <p className="text-muted-foreground text-sm">Sample forest river scene</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Showing sample analysis results below</p>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            {!useSampleData && (
              <div className="flex gap-3">
                <Button
                  onClick={handleAnalyze}
                  disabled={!imageData || isAnalyzing}
                  className="flex-1 h-11 font-medium tracking-wide"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Analyze Image'
                  )}
                </Button>
                {(imageData || analysisResult) && (
                  <Button
                    variant="outline"
                    onClick={handleClearAll}
                    className="h-11 px-6 font-medium tracking-wide"
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-sm">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="text-sm text-destructive/90 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Results */}
          <div>
            {!displayResult && !useSampleData && (
              <Card className="border-border h-full min-h-[400px] flex items-center justify-center">
                <CardContent className="text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Upload and analyze an image to see results here</p>
                </CardContent>
              </Card>
            )}

            {displayResult && (
              <ScrollArea className="h-[calc(100vh-12rem)]">
                <div className="space-y-4 pr-4">
                  {/* Summary */}
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-medium tracking-wide">Analysis Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="secondary" className="text-sm px-3 py-1">
                        {displayResult?.result?.summary ?? 'No summary available'}
                      </Badge>
                    </CardContent>
                  </Card>

                  {/* Collapsible Sections */}
                  <div className="space-y-3">
                    {/* Scene Description */}
                    <CollapsibleSection title="Scene Description" defaultOpen={true}>
                      <p className="text-sm leading-relaxed">
                        {displayResult?.result?.data?.scene_description ?? 'No scene description available'}
                      </p>
                    </CollapsibleSection>

                    {/* Objects Detected */}
                    <CollapsibleSection title="Objects Detected">
                      {Array.isArray(displayResult?.result?.data?.objects_detected) && displayResult.result.data.objects_detected.length > 0 ? (
                        <div className="space-y-2">
                          {displayResult.result.data.objects_detected.map((obj, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-secondary/50 rounded-sm">
                              <span className="text-sm font-medium capitalize">{obj?.object ?? 'Unknown'}</span>
                              <Badge variant="outline" className="text-xs">
                                {obj?.confidence ?? 'N/A'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No objects detected</p>
                      )}
                    </CollapsibleSection>

                    {/* Text Extracted (OCR) */}
                    <CollapsibleSection title="Text Extracted (OCR)">
                      {displayResult?.result?.data?.text_extracted ? (
                        <div className="space-y-3">
                          <p className="text-sm leading-relaxed bg-secondary/50 p-3 rounded-sm font-mono">
                            {displayResult.result.data.text_extracted}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyText(displayResult.result.data.text_extracted)}
                            className="w-full"
                          >
                            {copiedText ? (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Text
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No text found in image</p>
                      )}
                    </CollapsibleSection>

                    {/* Color Analysis */}
                    <CollapsibleSection title="Color Analysis">
                      {Array.isArray(displayResult?.result?.data?.color_analysis?.dominant_colors) && displayResult.result.data.color_analysis.dominant_colors.length > 0 ? (
                        <div className="space-y-3">
                          {displayResult.result.data.color_analysis.dominant_colors.map((color, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2 bg-secondary/50 rounded-sm">
                              <div
                                className="w-12 h-12 rounded-sm border border-border flex-shrink-0"
                                style={{ backgroundColor: color?.hex_code ?? '#000000' }}
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">{color?.color_name ?? 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground font-mono">{color?.hex_code ?? 'N/A'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No color analysis available</p>
                      )}
                    </CollapsibleSection>

                    {/* Mood & Context */}
                    <CollapsibleSection title="Mood & Context">
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2 tracking-wide uppercase">Emotional Tone</p>
                          <Badge variant="secondary" className="text-sm px-3 py-1 capitalize">
                            {displayResult?.result?.data?.mood_and_context?.emotional_tone ?? 'Unknown'}
                          </Badge>
                        </div>
                        <Separator className="bg-border" />
                        <div>
                          <p className="text-xs text-muted-foreground mb-2 tracking-wide uppercase">Suggested Use Cases</p>
                          {Array.isArray(displayResult?.result?.data?.mood_and_context?.suggested_use_cases) && displayResult.result.data.mood_and_context.suggested_use_cases.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {displayResult.result.data.mood_and_context.suggested_use_cases.map((useCase, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {useCase}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No suggestions available</p>
                          )}
                        </div>
                      </div>
                    </CollapsibleSection>
                  </div>

                  {/* Metadata */}
                  {displayResult?.metadata && (
                    <Card className="border-border bg-muted/30">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Agent: {displayResult.metadata.agent_name ?? 'Unknown'}</span>
                          <span>{displayResult.metadata.timestamp ? new Date(displayResult.metadata.timestamp).toLocaleString() : 'N/A'}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && rawResponse && (
          <Card className="border-border mt-6 bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium tracking-wide">Debug: Raw Agent Response</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(rawResponse)
                  }}
                  className="h-8 text-xs"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <pre className="text-xs font-mono bg-secondary/50 p-4 rounded-sm overflow-x-auto whitespace-pre-wrap break-words">
                  {rawResponse}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Agent Status */}
        <Card className="border-border mt-8 bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${isAnalyzing ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium">Image Analyzer Agent</p>
                <p className="text-xs text-muted-foreground">Vision analysis • OCR • Object detection • Color analysis</p>
              </div>
              <Badge variant={isAnalyzing ? 'default' : 'secondary'} className="text-xs">
                {isAnalyzing ? 'Active' : 'Ready'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
