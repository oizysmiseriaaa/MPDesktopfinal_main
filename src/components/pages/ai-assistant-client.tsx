"use client"

import { useState } from "react"
import { Wand2, MessageSquare, FileText, Loader2, Send, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { apiClient } from "@/lib/api-client"
import { useToast } from "@/hooks/use-toast"

export default function AIAssistantClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState("")

  // Response Generator State
  const [guestInquiry, setGuestInquiry] = useState("")
  const [listingDetails, setListingDetails] = useState("")
  const [hostInstructions, setHostInstructions] = useState("Keep it friendly and professional. Mention that we have a key box for check-in.")

  // Listing Generator State
  const [propName, setPropName] = useState("")
  const [propLocation, setPropLocation] = useState("")
  const [amenities, setAmenities] = useState("")

  const handleGenerateResponse = async () => {
    if (!guestInquiry || !listingDetails) {
      toast({
        title: "Missing Information",
        description: "Please provide both the inquiry and listing details.",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const { generatedResponse } = await apiClient.post<{ generatedResponse: string }>('/ai/guest-response', {
        guestInquiry,
        listingDetails,
        hostInstructions
      });
      setResult(generatedResponse)
    } catch (error: any) {
      console.error("AI Error:", error);
      toast({
        title: "Generation Failed",
        description: error?.message || "Ensure your API backend is running.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateListing = async () => {
    if (!propName || !propLocation) {
      toast({
        title: "Missing Information",
        description: "Please provide property name and location.",
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const { description } = await apiClient.post<{ description: string }>('/ai/listing-description', {
        propertyName: propName,
        location: propLocation,
        bedrooms: 2,
        bathrooms: 2,
        guests: 4,
        amenities: amenities.split(',').map(s => s.trim()),
        uniqueSellingPoints: ["Amazing view", "Walking distance to town"],
        targetAudience: "Families"
      });
      setResult(description)
    } catch (error: any) {
      console.error("AI Error:", error);
      toast({
        title: "Generation Failed",
        description: error?.message || "Ensure your API backend is running.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-accent/20 rounded-lg">
          <Wand2 className="h-6 w-6 text-accent" />
        </div>
        <div className="text-left">
          <h1 className="text-3xl font-bold text-foreground">AI Assistant</h1>
          <p className="text-muted-foreground">Smart tools to automate your guest communication and listings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Tabs defaultValue="response" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="response" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Guest Response
            </TabsTrigger>
            <TabsTrigger value="listing" className="gap-2">
              <FileText className="h-4 w-4" /> Property Listing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="response">
            <Card className="shadow-card border border-border bg-card">
              <CardHeader className="text-left">
                <CardTitle className="text-xl text-foreground">Response Generator</CardTitle>
                <CardDescription>Draft intelligent replies to guest questions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-left">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Guest Inquiry</Label>
                  <Textarea 
                    placeholder="e.g., Hi, does the property have a high chair? Also, how far is the beach?" 
                    className="min-h-[100px] bg-background border border-border"
                    value={guestInquiry}
                    onChange={(e) => setGuestInquiry(e.target.value)}
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Listing Context</Label>
                  <Textarea 
                    placeholder="e.g., Modern 2BR condo in Laguna. 10 min walk to beach. Fully equipped kitchen with baby gear available." 
                    className="min-h-[80px] bg-background border border-border"
                    value={listingDetails}
                    onChange={(e) => setListingDetails(e.target.value)}
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Additional Instructions</Label>
                  <Input 
                    placeholder="Optional host guidance..." 
                    className="h-11 bg-background border border-border"
                    value={hostInstructions}
                    onChange={(e) => setHostInstructions(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleGenerateResponse} 
                  disabled={loading}
                  className="w-full h-12 gradient-btn text-white font-bold gap-2 shadow-lg"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  Generate Smart Response
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="listing">
            <Card className="shadow-card border border-border bg-card">
              <CardHeader className="text-left">
                <CardTitle className="text-xl text-foreground">Listing Generator</CardTitle>
                <CardDescription>Create compelling descriptions for your rentals.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-left">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Property Name</Label>
                  <Input 
                    placeholder="e.g., Sunset Breeze Villa" 
                    className="h-11 bg-background border border-border"
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Location</Label>
                  <Input 
                    placeholder="e.g., Miami Beach, FL" 
                    className="h-11 bg-background border border-border"
                    value={propLocation}
                    onChange={(e) => setPropLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Key Amenities (comma separated)</Label>
                  <Textarea 
                    placeholder="e.g., Private pool, Fast WiFi, Beach access" 
                    className="min-h-[80px] bg-background border border-border"
                    value={amenities}
                    onChange={(e) => setAmenities(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={handleGenerateListing} 
                  disabled={loading}
                  className="w-full h-12 gradient-btn text-white font-bold gap-2 shadow-lg"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  Generate Listing Text
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="h-fit shadow-card border border-border bg-card">
          <CardHeader className="text-left">
            <CardTitle className="flex items-center gap-2 text-foreground">
              Generated Content
              {result && <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">AI Ready</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="whitespace-pre-wrap p-4 bg-secondary/50 rounded-xl border border-border text-sm leading-relaxed text-left text-foreground">
                {result}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4 text-center">
                <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center shadow-inner">
                  <Sparkles className="h-8 w-8 opacity-20 text-amber-500" />
                </div>
                <p className="text-sm font-medium">Output will appear here once generated.</p>
              </div>
            )}
          </CardContent>
          {result && (
            <CardFooter className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl h-11 font-bold" onClick={() => {
                navigator.clipboard.writeText(result);
                toast({ title: "Copied!", description: "Content copied to clipboard." });
              }}>
                Copy to Clipboard
              </Button>
              <Button className="flex-1 gradient-btn text-white rounded-xl h-11 font-bold">
                Apply to Listing
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  )
}
