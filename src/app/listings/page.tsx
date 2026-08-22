"use client"

import { useState } from "react"
import { Plus, Search, Filter, MoreHorizontal, Bed, Bath, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Image from "next/image"

const MOCK_LISTINGS = [
  {
    id: 1,
    title: "Modern Minimalist Loft",
    location: "Downtown Seattle, WA",
    price: 185,
    bedrooms: 1,
    bathrooms: 1,
    guests: 2,
    status: "Active",
    image: "https://picsum.photos/seed/loft/600/400"
  },
  {
    id: 2,
    title: "Oceanfront Villa",
    location: "Malibu, CA",
    price: 450,
    bedrooms: 3,
    bathrooms: 2.5,
    guests: 6,
    status: "Active",
    image: "https://picsum.photos/seed/villa/600/400"
  },
  {
    id: 3,
    title: "Cozy Mountain Cabin",
    location: "Aspen, CO",
    price: 275,
    bedrooms: 2,
    bathrooms: 2,
    guests: 4,
    status: "Maintenance",
    image: "https://picsum.photos/seed/cabin/600/400"
  },
  {
    id: 4,
    title: "Historic Townhouse",
    location: "Charleston, SC",
    price: 320,
    bedrooms: 4,
    bathrooms: 3,
    guests: 8,
    status: "Active",
    image: "https://picsum.photos/seed/townhouse/600/400"
  },
]

export default function ListingsPage() {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredListings = MOCK_LISTINGS.filter(l => 
    l.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    l.location.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Property Listings</h1>
        <p className="text-muted-foreground">Listing management is not configured in this application.</p>
        </div>
      <Button className="gap-2" disabled title="Listing management is not configured">
        <Plus className="h-4 w-4" /> Add Listing unavailable
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search properties..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      <Button variant="outline" className="gap-2" disabled>
        <Filter className="h-4 w-4" /> Filters unavailable
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredListings.map((listing) => (
          <Card key={listing.id} className="overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className="relative aspect-video overflow-hidden">
              <Image 
                src={listing.image} 
                alt={listing.title} 
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                data-ai-hint="property listing"
              />
              <div className="absolute top-3 right-3">
                <Badge variant={listing.status === "Active" ? "default" : "secondary"}>
                  {listing.status}
                </Badge>
              </div>
            </div>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg leading-tight">{listing.title}</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem>View Details</DropdownMenuItem>
                    <DropdownMenuItem>Edit Listing</DropdownMenuItem>
                    <DropdownMenuItem>Calendar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Delete Listing</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-sm text-muted-foreground">{listing.location}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Bed className="h-4 w-4" /> {listing.bedrooms}
                </div>
                <div className="flex items-center gap-1">
                  <Bath className="h-4 w-4" /> {listing.bathrooms}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" /> {listing.guests}
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4 flex justify-between items-center">
              <p className="font-bold text-lg">
                ${listing.price} <span className="text-sm font-normal text-muted-foreground">/ night</span>
              </p>
              <Button size="sm" variant="outline">View Stats</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
