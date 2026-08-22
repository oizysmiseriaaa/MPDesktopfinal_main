
'use server';
/**
 * @fileOverview An AI agent that generates engaging property descriptions for listings.
 *
 * - generateListingDescription - A function that handles the property description generation process.
 * - ListingDescriptionInput - The input type for the generateListingDescription function.
 * - ListingDescriptionOutput - The return type for the generateListingDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ListingDescriptionInputSchema = z.object({
  propertyName: z.string().describe('The name or title of the property.'),
  location: z.string().describe('The location of the property (e.g., city, neighborhood).'),
  bedrooms: z.number().int().positive().describe('The number of bedrooms in the property.'),
  bathrooms: z.number().positive().describe('The number of bathrooms in the property.'),
  guests: z.number().int().positive().describe('The maximum number of guests the property can accommodate.'),
  amenities: z.array(z.string()).describe('A list of key amenities available at the property (e.g., WiFi, pool, fully equipped kitchen).'),
  uniqueSellingPoints: z.array(z.string()).describe('A list of unique aspects or features that make the property stand out (e.g., stunning ocean view, historic building, walk to local attractions).'),
  targetAudience: z.string().optional().describe('The ideal guest for this property (e.g., families, couples, business travelers).'),
});
export type ListingDescriptionInput = z.infer<typeof ListingDescriptionInputSchema>;

const ListingDescriptionOutputSchema = z.object({
  description: z.string().describe('The generated engaging and informative property description.'),
});
export type ListingDescriptionOutput = z.infer<typeof ListingDescriptionOutputSchema>;

export async function generateListingDescription(input: ListingDescriptionInput): Promise<ListingDescriptionOutput> {
  return listingDescriptionGeneratorFlow(input);
}

const prompt = ai.definePrompt({
  name: 'listingDescriptionPrompt',
  model: 'googleai/gemini-1.5-flash',
  input: {schema: ListingDescriptionInputSchema},
  output: {schema: ListingDescriptionOutputSchema},
  prompt: `You are an expert copywriter specializing in creating engaging and informative property descriptions for rental listings.

Craft a compelling property description using the following details:

Property Name: {{{propertyName}}}
Location: {{{location}}}
Bedrooms: {{{bedrooms}}}
Bathrooms: {{{bathrooms}}}
Accommodates: {{{guests}}} guests
Amenities: {{#each amenities}}- {{{this}}}\n{{/each}}
Unique Selling Points: {{#each uniqueSellingPoints}}- {{{this}}}\n{{/each}}
{{#if targetAudience}}Target Audience: {{{targetAudience}}}\n{{/if}}

Focus on highlighting the property's best features, creating a vivid picture for potential guests, and encouraging bookings. The description should be engaging, friendly, and informative. Ensure to incorporate the unique selling points effectively.`,
});

const listingDescriptionGeneratorFlow = ai.defineFlow(
  {
    name: 'listingDescriptionGeneratorFlow',
    inputSchema: ListingDescriptionInputSchema,
    outputSchema: ListingDescriptionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
