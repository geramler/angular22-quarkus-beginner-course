import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/auth.interceptor';

bootstrapApplication(AppComponent, {
  // Configura HTTP para aplicar el interceptor de autenticación y habilita las rutas de la aplicación.
  providers: [provideHttpClient(withInterceptors([authInterceptor])), provideRouter(routes)]
}).catch((error) => console.error(error));
