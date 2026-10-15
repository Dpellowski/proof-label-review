import { bootstrapApplication } from "@angular/platform-browser";
import { provideZonelessChangeDetection } from "@angular/core";
import { AppComponent } from "./app";

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
}).catch(console.error);
