
'use server';
/**
 * @fileOverview An AI agent that generates automated, personalized responses to guest inquiries.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AutomatedGuestResponseInputSchema = z.object({
  guestInquiry: z.string().describe("The guest's message or inquiry."),
  listingDetails: z.string().describe("Information about the listing."),
  hostInstructions: z.string().describe("Specific instructions from the host."),
});
export type AutomatedGuestResponseInput = z.infer<typeof AutomatedGuestResponseInputSchema>;

const AutomatedGuestResponseOutputSchema = z.object({
  generatedResponse: z.string().describe("The AI-generated personalized response."),
});
export type AutomatedGuestResponseOutput = z.infer<typeof AutomatedGuestResponseOutputSchema>;

export async function automatedGuestResponse(input: AutomatedGuestResponseInput): Promise<AutomatedGuestResponseOutput> {
  const {output} = await ai.generate({
    model: 'googleai/gemini-1.5-flash',
    output: {
      schema: AutomatedGuestResponseOutputSchema
    },
    system: "You are a helpful and polite host for a property management business called Manila Prime.",
    prompt: `
      Context:
      Listing Details: ${input.listingDetails}
      Host Instructions: ${input.hostInstructions}
      
      Guest Message: 
      "${input.guestInquiry}"
      
      Task:
      Draft a friendly, professional, and helpful response to the guest. Ensure all their questions are addressed based on the listing details.
    `,
  });

  if (!output) throw new Error('AI failed to produce an output.');
  return output;
}
